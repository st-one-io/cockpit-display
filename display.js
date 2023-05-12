/**
 * Copyright 2023 ST-One
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
**/

//TODO: on ST-One set the DISPLAY env. variable when installing X
//TODO: add overscann settings (https://wiki.archlinux.org/m.php/xrandr#Correction_of_overscan_tv_resolutions)
//TODO: persist config for multiple monitors (https://www.x.org/releases/current/doc/man/man5/xorg.conf.5.xhtml)
//TODO: the videdriver is hardcoded, it should come from X

const xrandr = 'xrandr';
const xorg_config_path = '/etc/X11/xorg.conf.d/';
const xorg_config_file = '10-monitor.conf';
//ST-One specific settings
const display = 'DISPLAY=:0';

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
     *       "m": 0,
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
            parse_xrandr(xrandr, function (data) {
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
    let popup = document.querySelector("#error-popup-message")
    popup.innerText = msg

    let err_popup = document.querySelector("#error-popup")
    err_popup.style.display = "block"

    let close_button = document.querySelector("#error-popup-close")

    close_button.addEventListener("click", (e) => {
        err_popup.style.display = "none"

        removeEventListener("click", close_button)
    })
}

function PageDisplays(model) {
    this.id         = "displays"
    this.model      = model
}

/* Query for element values and set them as parameters for the xrandr call */
PageDisplays.prototype.apply = function () {
    let parameters = {
        name: document.querySelector('#display-selected-title').innerText,
        state: document.querySelector("#display-state").value == "true",
        resolution: document.querySelector('#resolution-dropdown').value,
        orientation: document.querySelector("#orientation-dropdown").value,
        rate: document.querySelector("#rate-dropdown").value
    }

    // update the UI after applying settings
    pd.model.apply_settings(parameters, function () { pd.update(); });
}

/* This does too much, I don't like it */
PageDisplays.prototype.update = function() {
    // drop children
    document.querySelector("#displays-box").innerHTML = ""

    pd.model.request_devices(function (data) {
        /* Don't like these array walking loops, but hey, it works, I guess */
        for (var prop in data) {
            if (data.hasOwnProperty(prop) && data[prop].connected) {
                var element = data[prop]
                var name = prop

                // add screen selector button
                let b = document.createElement("button")

                b.id = name
                b.innerText = name
                b.classList.add("monitor",
                    "button", "button-rotate-" + element.orientation)

                document.querySelector("#displays-box").append(b)

                b.addEventListener("click",
                    render_settings_panel.bind( true
                                              , name
                                              , element.connected
                                              , element.modes
                                              , element.orientation ))

                // update UI
                render_settings_panel( name
                                     , element.connected
                                     , element.modes
                                     , element.orientation )
            }
        }
    })

    function render_settings_panel(name, state, modes, current_orientation) {
        console.log(state)
        // update title to be the selected display
        document.querySelector("#display-selected-title").innerText = name

        //updating the state checkbox and orientation dropdown
        let state_checkbox = document.querySelector("#display-state")
        let o_dropdown     = document.querySelector("#orientation-dropdown")

        if (state) {
            state_checkbox.value = state_checkbox.checked = true
            o_dropdown.disabled = false
        } else {
            state_checkbox.value = state_checkbox.checked = false
            o_dropdown.disabled = true
        }

        // updating resolution option
        function rate_onchange(opt) {
            render_rate(opt.target.value)
        }

        var res_opts = document.querySelector("#resolution-dropdown")

        // make shur there is only one event listener
        res_opts.removeEventListener("change", rate_onchange)
        res_opts.addEventListener("change", rate_onchange)

        // dropping children
        res_opts.innerHTML = ""

        var appended_resolutions = [];
        for (var m in modes) {
            if (modes.hasOwnProperty(m)) {
                if (modes[m].current && state)
                    var current_res = modes[m].name

                //avoid printing the same resolution twice
                if (!appended_resolutions.includes(modes[m].name)) {
                    let o = document.createElement("option")

                    o.value = modes[m].name.toLowerCase()
                    o.innerText = modes[m].name

                    res_opts.append(o)
                    appended_resolutions.push(modes[m].name)
                }
            }
        }

        res_opts.value = current_res ? current_res.toLowerCase() : ""
        render_rate(current_res)

        function render_rate(sel_res) {
            // dropping children
            var rate_opts = document.querySelector("#rate-dropdown")
            rate_opts.innerHTML = ""

            var selected_rate  = null
            var appended_rates = []
            for (var m in modes) {
                if (modes.hasOwnProperty(m)) {
                    var element = modes[m];

                    if (element.name == sel_res &&
                        !appended_rates.includes(element.dimensions.vertical.clock)) {
                        let o = document.createElement("option")

                        o.value = element.dimensions.vertical.clock
                        o.innerText = o.value + " Hz"

                        rate_opts.append(o)
                        appended_rates.push(o.value)

                        if (element.current)
                            selected_rate = o.value
                    }
                }
            }

            // display the selected rate as defult value
            if (selected_rate)
                rate_opts.value = selected_rate
        }
    }
}

/* Setup most default values and event listeners */
PageDisplays.prototype.setup = function() {
    let display_state = document.querySelector("#display-state")
    let apply_button  = document.querySelector("#advanced-button")

    document.querySelector("#orientation-dropdown").disabled = true

    // display state defaults to NOT ON
    display_state.value = display_state.checked = false

    display_state.addEventListener("click", (e) => {
        e.target.value = e.target.value === "false" ? "true" : "false"
    })

    // display advanced options, or not
    apply_button.addEventListener("click", (e) => {
        let rate = document.querySelector("#display-rate")

        if (rate.style.display === "block")
            rate.style.display = "none"
        else
            rate.style.display = "block"
    })

    document.querySelector("#display-apply")
            .addEventListener("click", this.apply)

    document.querySelector("#display-refresh")
            .addEventListener("click", this.update)

    // force interface update
    this.update()
}

function init() {
    var model = new DisplayManagerModel()

    cockpit.translate()

    pd = new PageDisplays(model)
    pd.setup()
}

/* This "global" object is a way to work around the this object.
 * Blame this on how stupid JS and web development is. */
var pd // (p)age (d)isplay

document.addEventListener("DOMContentLoaded", init)
