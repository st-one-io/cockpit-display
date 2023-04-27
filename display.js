/**
 * Copyright 2020 ST-One
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); 
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *  http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* jshint esversion:6 */

//TODO: on ST-One set the DISPLAY env. variable when installing X
//TODO: add overscann settings (https://wiki.archlinux.org/index.php/xrandr#Correction_of_overscan_tv_resolutions)
//TODO: persist config for multiple monitors (https://www.x.org/releases/current/doc/man/man5/xorg.conf.5.xhtml)
//TODO: the videdriver is hardcoded, it should come from X

var $ = require('jquery');
var cockpit = require('cockpit');
var utils = require('./utils');


const xrandr = 'xrandr';
const xorg_config_path = '/etc/X11/xorg.conf.d/';
const xorg_config_file = '10-monitor.conf';
//ST-One specific settings
const display = 'DISPLAY=:0';

/* jQuery extensions */
require('patterns');

require('page.css');
require('table.css');
require('plot.css');
require('journal.css');
require('./display.css');

function DisplayManagerModel() {
    var self = this;

    /** 
     * Apply xrandr settings
     * @param   {array} parameters can contain the following parameters:
     * name:        monitor name according to Xrandr response         
     * resolution:  a string like 1920x1080 but only if the mode already exist
     * rate :       a number like 59,9
     * state:       true or false
     * orientation: right, left, normal, inverted
     */
    self.apply_settings = function (parameters, callback) {
        var args = [];
        args.push(xrandr);
        args.push("--output");
        args.push(parameters.name);
        if (!parameters.state) {
            args.push('--off');

        } else if (parameters.state && parameters.resolution === '') {
            args.push('--auto');
        } else {
            if (parameters.orientation) {
                parameters.orientation = parameters.orientation.toLowerCase();
                var orientation_regex = /right|left|normal|inverted/g;
                if (orientation_regex.exec(parameters.orientation)) {
                    args.push("--rotate");
                    args.push(parameters.orientation);
                } else {
                    popup_error('Invalid orientation');
                    return 'error';
                }

            }
            if (parameters.resolution) {
                var resolution_regex = /\d+x\d+\w*/g;
                if ((resolution_regex.exec(parameters.resolution))) {
                    args.push('--mode');
                    args.push(parameters.resolution);
                } else {
                    popup_error('Invalid resolution');
                    return 'error';
                }

            }
            if (parameters.rate) {
                if (parseFloat(parameters.rate)) {
                    args.push('--rate');
                    args.push(parameters.rate);
                } else {
                    popup_error('Invalid rate');
                    return 'error';
                }
            }
        }

        var output = cockpit.spawn(args, {
            environ: [display]
        });

        output.fail(popup_error);
        output.done(function (data) {
            callback(data);
            write_config(data);
        });
    };

    /**
     * Saves the X config file for presisting settings
     * Structured of the X config file:
     *  Section "Monitor"
     *  	Identifier "HDMI-1"
     *  	Modeline "1280x1024_60.00"  109.00  1280 1368 1496 1712 1024 1027 1034 1063 -hsync +vsync
     *  	Option "PreferredMode" "1280x1024_60.00"
     *  EndSection
     *  
     *  Section "Screen"
     *  	Identifier "Screen0"
     *  	Monitor "HDMI-1"
     *  	DefaultDepth 24
     *  	SubSection "Display"
     *  		Modes "1280x1024_60.00"
     *  	EndSubSection
     *  EndSection
     *  
     *  Section "Device"
     *  	Identifier "Device0"
     *  	Driver "modesetting"
     *  EndSection	
     * @param {object} display 
     */
    function write_config(device) {

        //genereating the config string


        var configuration;
        for (var display_index in device) {
            if (device.hasOwnProperty(display_index) && device[display_index].connected) {
                for (var mode_index in device[display_index].modes) {
                    if (device[display_index].modes[mode_index].current) {

                        var mode = device[display_index].modes[mode_index];
                        configuration = ' Section "Monitor"\n' +
                            '    Identifier "' + display_index + '"\n' +
                            '    Modeline "' + mode.name + '"  ' + mode.rate + '  ' + mode.dimensions.horizontal.width +
                            ' ' + mode.dimensions.horizontal.start + ' ' + mode.dimensions.horizontal.end +
                            ' ' + mode.dimensions.horizontal.total + ' ' + mode.dimensions.vertical.width +
                            ' ' + mode.dimensions.vertical.start + ' ' + mode.dimensions.vertical.end +
                            ' ' + mode.dimensions.vertical.total + ' ' + mode.optionals.toLowerCase() + '\n' +
                            //'    Option "PreferredMode" "' + mode.name + '"\n' +
                            '    Option "Rotate" "' + device[display_index].orientation + '"\n' +
                            'EndSection\n' +
                            '\n' +
                            'Section "Screen"\n' +
                            '    Identifier "Screen0"\n' +
                            '    Monitor "' + display_index + '"\n' +
                            '    DefaultDepth 24\n' +
                            '    SubSection "Display"\n' +
                            '        Modes "' + mode.name + '"\n' +
                            '    EndSubSection\n' +
                            'EndSection\n' +
                            '\n' +
                            'Section "Device"\n' +
                            '    Identifier "Device0"\n' +
                            '    Driver "modesetting"\n' +
                            'EndSection	\n';

                    }
                }

            }
        }
        //----

        if (configuration) {
            var file = cockpit.file(xorg_config_path + xorg_config_file, {
                superuser: "try"
            });
            var promise = file.read();

            promise.done(function (data, tag) {

                if (data === null) {
                    file.close();
                    var create_folder = cockpit.script('mkdir -p ' + xorg_config_path + ' && touch ' + xorg_config_path + xorg_config_file, {
                        superuser: 'require'
                    });
                    create_folder.done(function (data) {
                        //recreate the file
                        file = cockpit.file(xorg_config_path + xorg_config_file, {
                            superuser: "try"
                        });
                        write_to_file();
                    });
                    create_folder.fail(function (data) {
                        file.close();
                        popup_error('Error on persisting configuration. Your changes will be lost after reboot. Error: ' + data);
                    });
                } else {
                    write_to_file();

                }
            }.bind(this));

        }

        function write_to_file() {
            var replace = file.replace(configuration);
            replace.done(function (data) {
                file.close();
            });
            replace.fail(function (data) {
                file.close();
                popup_error('Error on persisting configuration. Your changes will be lost after reboot. Error: ' + data);
            });

        }
        /*

                var output2 = cockpit.script('mkdir -p /etc/X11/xorg.conf.d/ && echo \"' + content + '\" > /etc/X11/xorg.conf.d/10-monitor.conf', {
                    superuser: 'require'
                });
                output2.stream(console.log);
                return 0;
                */
    }
    /**
     * Requeset and parse xrandr response. The callback response has a data in the following format
     * "HDMI-1": {
     *       "connected": true,
     *       "orientation": "normal",
     *       "modes": [{
     *           "name": "1920x1080",
     *           "width": "1920",
     *           "height": "1080",
     *           "rate": 148.5,
     *           "optionals": "+HSync +VSync ",
     *           "current": true,
     *           "preferred": true,
     *           "dimensions": {
     *               "vertical": {
     *                   "width": "1080",
     *                   "start": "1084",
     *                   "end": "1089",
     *                   "total": "1125",
     *                   "clock": 60
     *               },
     *               "horizontal": {
     *                   "width": "1920",
     *                   "start": "2008",
     *                   "end": "2052",
     *                   "total": "2200",
     *                   "skew": "0",
     *                   "clock": 67.5
     *               }
     *           }
     *       }],
     *       "index": 0,
     *       "width": 1920,
     *       "height": 1080,
     *       "left": 0,
     *       "top": 0
     *   }
     * 
     */
    self.request_devices = function (callback) {
        var output = cockpit.spawn([xrandr, "--verbose"], {
            environ: [display]
        });

        output.fail(function (msg) {
            popup_error('Xrandr returned an error:' + msg);
        });
        output.done(function (xrandr) {
            utils.parse_xrandr(xrandr, function (data) {
                write_config(data);
                callback(data);
            });
        });

    };

}

/**
 * Throws a pop-up error message
 * @param {String} msg message to be shown
 */
function popup_error(msg) {
    console.warn(msg);
    $("#error-popup-message").text(msg);
    $('.modal[role="dialog"]').modal('hide');
    $('#error-popup').modal('show');
}

PageDisplays.prototype = {
    _init: function (model) {
        this.id = "displays";
        this.model = model;
        this.setup();

    },
    setup: function () {
        var self = this;
        //-- page elements
        self.orientation = $('#display-orientation');
        self.state = $('#display-state');
        self.rate = $('#display-rate');
        self.resolution = $('#display-resolution');
        //----

        self.orientation.on('click', 'li', function (ev) {
            var target = $(this);
            self.orientation.find('span')
                .text(target.text())
                .data('toggle', target.data('toggle'));
            self.rate.prop('checked', true);

        });

        self.rate.on('click', 'li', function (ev) {
            var target = $(this);
            self.rate.find('span')
                .text(target.text())
                .data('toggle', target.data('toggle'));
            $('#display-state').prop('checked', true);
        });

        $('#display-apply').click($.proxy(this, "apply"));
        self.update();
        $('#display-refresh').click($.proxy(this, "update"));

    },
    update: function () {
        var self = this;

        $('#displays-box').empty();
        self.model.request_devices(function (data) {
            for (var prop in data) {
                if (data.hasOwnProperty(prop) && data[prop].connected) {
                    var element = data[prop];

                    var name = prop;
                    $('#displays-box').append('<button id=\"' + name + '\">');

                    var button = $('#' + name);


                    button.css({
                        height: element.height !== 0 ? element.height / 10 : '',
                        width: element.width !== 0 ? element.width / 10 : '',
                    });


                    button.addClass('button')
                        .addClass('monitor')
                        .addClass('button-rotate-' + element.orientation)
                        .append('<span>' + name + '</span>');

                    button.click(render_settings_panel.bind(true, name, element.connected, element.modes, element.orientation));
                    render_settings_panel(name, element.connected, element.modes, element.orientation);

                }
            }
        }.bind(this));

        function render_settings_panel(name, state, modes, current_orientation) {
            //updating title
            $('#display-selected-title').text(name);

            //updating the state
            $('#display-state').prop('checked', state);

            //updating resolution option
            var resolution_options = self.resolution.find('ul');
            resolution_options.empty();
            var appended_resolutions = [];
            for (var index in modes) {
                if (modes.hasOwnProperty(index)) {

                    //if it's the current, show it
                    if (modes[index].current && state) {
                        self.resolution.find('span').text(modes[index].name + (modes[index].current ? ' (current)' : '')).data('toggle', modes[index].name);
                        render_rate(modes[index].name);
                    } else if (!state) {
                        //do not select any resolution if monitor is off
                        self.resolution.find('span').text('').data('toggle', '');

                    }

                    //avoid printing the same resolution twice
                    if (!appended_resolutions.includes(modes[index].name)) {
                        resolution_options
                            .append('<li class="presentation" data-toggle=\ "' + modes[index].name + '\"><a>' +
                                modes[index].name + (modes[index].current ? ' (current)' : '') +
                                '</a></li>');
                        appended_resolutions.push(modes[index].name);
                    }

                }
            }

            self.resolution.off().on("click", "li", function (ev) {
                self.resolution.find('span').text($(this).text()).data('toggle', $(this).data('toggle'));
                self.state.prop('checked', true);
                render_rate($(this).data('toggle'));
            });

            //updating orientation
            self.orientation.find('span').text(current_orientation).data('toggle', current_orientation);

            //updating rate options 
            function render_rate(selected_resolution) {
                var options = self.rate.find('ul').empty();

                var available_rates = [];
                var selected_rate = null;
                var appended_rates = [];
                for (var index in modes) {
                    if (modes.hasOwnProperty(index)) {
                        var element = modes[index];

                        if (element.name == selected_resolution && !appended_rates.includes(element.dimensions.vertical.clock)) {
                            options
                                .append('<li class="presentation" data-toggle=\ "' +
                                    element.dimensions.vertical.clock +
                                    '\"><a>' +
                                    element.dimensions.vertical.clock +
                                    'Hz</a></li>');
                            appended_rates.push(element.dimensions.vertical.clock);
                            if (element.current) {
                                selected_rate = element.dimensions.vertical.clock;
                            }
                            available_rates.push(element.dimensions.vertical.clock);
                        }
                    }
                }
                if (selected_rate) {
                    self.rate.find('span').text(selected_rate + 'Hz').data("toggle", selected_rate);
                } else if (available_rates) {
                    self.rate.find('span').text(available_rates[0] + 'Hz').data("toggle", available_rates[0]);
                }

            }
        }


    },
    apply: function () {
        var self = this;
        var parameters = {
            name: $('#display-selected-title').text(),
            state: self.state.prop('checked'),
            resolution: self.resolution.find('span').data('toggle'),
            orientation: self.orientation.find('span').data('toggle'),
            rate: self.rate.find('span').data('toggle')
        };

        self.model.apply_settings(parameters, function () {
            self.update();
        });
    }
};

function PageDisplays(model) {
    this._init(model);
}

function init() {
    var model;
    model = new DisplayManagerModel();

    $("body").show();
    cockpit.translate();
    new PageDisplays(model);
}

$(init);