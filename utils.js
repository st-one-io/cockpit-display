/*
 * This tool parses the xrandr --verbose output 
 *
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


"use strict";

var type = {
    connected: /^(\S+) connected (primary )*(?:(\d+)x(\d+)\+(\d+)\+(\d))*\s*(\(\w+\))*\s*(\w*)/,
    disconnected: /^(\S+) (disconnected|unknown connection)/,
    mode: /^\s+(\d+)x([0-9i]+).*\s+(\(\w+\))\s+([0-9]+\.[0-9]+)MHz\s*((\s*[\+]*[\-]*\w*\s)*)/,
    dimension_horizontal: /^\s+h\:\s+width\s+(\d+)\s+start\s+(\d+)\s+end\s+(\d+)\s+total\s+(\d+)\s*skew\s*(\w)\s*clock\s*([0-9]*.[0-9]*)/,
    dimension_vertical: /^\s+v\:\s+height\s+(\d+)\s+start\s+(\d+)\s+end\s+(\d+)\s+total\s+(\d+)\s*clock\s*([0-9]*.[0-9]*)/
};

/**
 * This function parses an xrandr output with the following format
 * Screen 0: minimum 320 x 200, current 1080 x 1920, maximum 2048 x 2048
 * HDMI-1 connected 1080x1920+0+0 (0x44) right (normal left inverted right x axis y axis) 477mm x 268mm
 * 	Identifier: 0x42
 * 	Timestamp:  96798461
 * 	Subpixel:   unknown
 * 	Gamma:      1.0:1.0:1.0
 * 	Brightness: 1.0
 * 	Clones:    
 * 	CRTC:       2
 * 	CRTCs:      2
 * 	Transform:  1.000000 0.000000 0.000000
 * 	            0.000000 1.000000 0.000000
 * 	            0.000000 0.000000 1.000000
 * 	           filter: 
 * 	EDID: 
 * 		00ffffffffffff001e6dd75801010101		
 *   1920x1080 (0x44) 148.500MHz +HSync +VSync *current +preferred
 *         h: width  1920 start 2008 end 2052 total 2200 skew    0 clock  67.50KHz
 *         v: height 1080 start 1084 end 1089 total 1125           clock  60.00Hz
 *   1920x1080 (0x45) 148.500MHz +HSync +VSync
 *         h: width  1920 start 2448 end 2492 total 2640 skew    0 clock  56.25KHz
 *         v: height 1080 start 1084 end 1089 total 1125           clock  50.00Hz 
 * 
 * @param {*} data
 * @param {*} callback
 */
function parse_xrandr(data, callback) {
    var lines = data.split('\n');
    var result = {};
    var last_connection = null;
    var last_mode = 0;
    var index = 0;
    lines.forEach(function (line) {
        var tmp;
        if ((tmp = type.connected.exec(line))) {
            //when the monitor connected but "off" we have no data after tmp[3] 
            if (tmp[4] !== undefined) {
                result[tmp[1]] = {
                    connected: true,
                    orientation: tmp[8],
                    modes: [],
                    index: index++
                };
                if (tmp[3] && tmp[4]) {
                    result[tmp[1]].width = parseInt(tmp[3]);
                    result[tmp[1]].height = parseInt(tmp[4]);
                }
                if (tmp[5] && tmp[6]) {
                    result[tmp[1]].left = parseInt(tmp[5]);
                    result[tmp[1]].top = parseInt(tmp[6]);
                }
                last_connection = tmp[1];
                last_mode=0;
            } else {
                result[tmp[1]] = {
                    connected: false,
                    orientation: null,
                    modes: [],
                    index: index++,
                    width: 0,
                    height: 0,
                    top: 0,
                    left: 0
                };
                last_connection = tmp[1];
                last_mode=0;
            }

        } else if ((tmp = type.disconnected.exec(line))) {
            result[tmp[1]] = {
                connected: false,
                modes: [],
                index: index++
            };
            last_connection = tmp[1];
            last_mode=0;
        } else if ((tmp = type.mode.exec(line))) {
            var dimensions = {
                vertical: null,
                horizontal: null
            };
            var r = {
                name: tmp[1] + 'x' + tmp[2],
                width: tmp[1],
                height: tmp[2],
                rate: parseFloat(tmp[4]),
                optionals: tmp[5],
                current: line.includes('current') ? true : false,
                preferred: line.includes('preferred') ? true : false,
                dimensions: dimensions
            };
            result[last_connection].modes.push(r);
            last_mode++;
        } else if ((tmp = type.dimension_horizontal.exec(line))) {
            var dimension_h = {
                width: tmp[1],
                start: tmp[2],
                end: tmp[3],
                total: tmp[4],
                skew: tmp[5],
                clock: parseFloat(tmp[6])
            };
            result[last_connection].modes[last_mode - 1].dimensions.horizontal = dimension_h;

        } else if ((tmp = type.dimension_vertical.exec(line))) {
            var dimension_v = {
                width: tmp[1],
                start: tmp[2],
                end: tmp[3],
                total: tmp[4],
                clock: parseFloat(tmp[5])

            };
            result[last_connection].modes[last_mode - 1].dimensions.vertical = dimension_v;

        }
    });
    /* 
    result={
        "HDMI-1":{"connected":true,"orientation":"normal","modes":[{"name":"1920x1080","width":"1920","height":"1080","rate":148.5,"optionals":"+HSync +VSync ","current":true,"preferred":true,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1089","total":"1125","clock":60},"horizontal":{"width":"1920","start":"2008","end":"2052","total":"2200","skew":"0","clock":67.5}}},{"name":"1920x1080","width":"1920","height":"1080","rate":148.5,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1089","total":"1125","clock":50},"horizontal":{"width":"1920","start":"2448","end":"2492","total":"2640","skew":"0","clock":56.25}}},{"name":"1920x1080","width":"1920","height":"1080","rate":148.352,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1089","total":"1125","clock":59.94},"horizontal":{"width":"1920","start":"2008","end":"2052","total":"2200","skew":"0","clock":67.43}}},{"name":"1920x1080i","width":"1920","height":"1080i","rate":74.25,"optionals":"+HSync +VSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1094","total":"1125","clock":60},"horizontal":{"width":"1920","start":"2008","end":"2052","total":"2200","skew":"0","clock":33.75}}},{"name":"1920x1080i","width":"1920","height":"1080i","rate":74.25,"optionals":"+HSync +VSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1094","total":"1125","clock":50},"horizontal":{"width":"1920","start":"2448","end":"2492","total":"2640","skew":"0","clock":28.12}}},{"name":"1920x1080i","width":"1920","height":"1080i","rate":74.176,"optionals":"+HSync +VSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1080","start":"1084","end":"1094","total":"1125","clock":59.94},"horizontal":{"width":"1920","start":"2008","end":"2052","total":"2200","skew":"0","clock":33.72}}},{"name":"1680x1050","width":"1680","height":"1050","rate":119,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1050","start":"1053","end":"1059","total":"1080","clock":59.88},"horizontal":{"width":"1680","start":"1728","end":"1760","total":"1840","skew":"0","clock":64.67}}},{"name":"1280x1024","width":"1280","height":"1024","rate":135,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1024","start":"1025","end":"1028","total":"1066","clock":75.02},"horizontal":{"width":"1280","start":"1296","end":"1440","total":"1688","skew":"0","clock":79.98}}},{"name":"1280x1024","width":"1280","height":"1024","rate":108,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1024","start":"1025","end":"1028","total":"1066","clock":60.02},"horizontal":{"width":"1280","start":"1328","end":"1440","total":"1688","skew":"0","clock":63.98}}},{"name":"1152x864","width":"1152","height":"864","rate":108,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"864","start":"865","end":"868","total":"900","clock":75},"horizontal":{"width":"1152","start":"1216","end":"1344","total":"1600","skew":"0","clock":67.5}}},{"name":"1280x720","width":"1280","height":"720","rate":74.25,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":60},"horizontal":{"width":"1280","start":"1390","end":"1430","total":"1650","skew":"0","clock":45}}},{"name":"1280x720","width":"1280","height":"720","rate":74.25,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":50},"horizontal":{"width":"1280","start":"1720","end":"1760","total":"1980","skew":"0","clock":37.5}}},{"name":"1280x720","width":"1280","height":"720","rate":74.176,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":59.94},"horizontal":{"width":"1280","start":"1390","end":"1430","total":"1650","skew":"0","clock":44.96}}},{"name":"1024x768","width":"1024","height":"768","rate":78.8,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"768","start":"769","end":"772","total":"800","clock":75.08},"horizontal":{"width":"1024","start":"1040","end":"1136","total":"1312","skew":"0","clock":60.06}}},{"name":"1024x768","width":"1024","height":"768","rate":65,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"768","start":"771","end":"777","total":"806","clock":60},"horizontal":{"width":"1024","start":"1048","end":"1184","total":"1344","skew":"0","clock":48.36}}},{"name":"800x600","width":"800","height":"600","rate":49.5,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"600","start":"601","end":"604","total":"625","clock":75},"horizontal":{"width":"800","start":"816","end":"896","total":"1056","skew":"0","clock":46.88}}},{"name":"800x600","width":"800","height":"600","rate":40,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"600","start":"601","end":"605","total":"628","clock":60.32},"horizontal":{"width":"800","start":"840","end":"968","total":"1056","skew":"0","clock":37.88}}},{"name":"720x576","width":"720","height":"576","rate":27,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"576","start":"581","end":"586","total":"625","clock":50},"horizontal":{"width":"720","start":"732","end":"796","total":"864","skew":"0","clock":31.25}}},{"name":"720x480","width":"720","height":"480","rate":27.027,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"489","end":"495","total":"525","clock":60},"horizontal":{"width":"720","start":"736","end":"798","total":"858","skew":"0","clock":31.5}}},{"name":"720x480","width":"720","height":"480","rate":27,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"489","end":"495","total":"525","clock":59.94},"horizontal":{"width":"720","start":"736","end":"798","total":"858","skew":"0","clock":31.47}}},{"name":"640x480","width":"640","height":"480","rate":31.5,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"481","end":"484","total":"500","clock":75},"horizontal":{"width":"640","start":"656","end":"720","total":"840","skew":"0","clock":37.5}}},{"name":"640x480","width":"640","height":"480","rate":25.2,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"490","end":"492","total":"525","clock":60},"horizontal":{"width":"640","start":"656","end":"752","total":"800","skew":"0","clock":31.5}}},{"name":"640x480","width":"640","height":"480","rate":25.175,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"490","end":"492","total":"525","clock":59.94},"horizontal":{"width":"640","start":"656","end":"752","total":"800","skew":"0","clock":31.47}}},{"name":"720x400","width":"720","height":"400","rate":28.32,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"400","start":"412","end":"414","total":"449","clock":70.08},"horizontal":{"width":"720","start":"738","end":"846","total":"900","skew":"0","clock":31.47}}}],"index":0,"width":1920,"height":1080,"left":0,"top":0},
        "HDMI-2":{"connected":true,"orientation":"right","modes":[{"name":"1680x1050","width":"1680","height":"1050","rate":119,"optionals":"+HSync ","current":true,"preferred":true,"dimensions":{"vertical":{"width":"1050","start":"1053","end":"1059","total":"1080","clock":59.88},"horizontal":{"width":"1680","start":"1728","end":"1760","total":"1840","skew":"0","clock":64.67}}},{"name":"1280x1024","width":"1280","height":"1024","rate":135,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1024","start":"1025","end":"1028","total":"1066","clock":75.02},"horizontal":{"width":"1280","start":"1296","end":"1440","total":"1688","skew":"0","clock":79.98}}},{"name":"1280x1024","width":"1280","height":"1024","rate":108,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"1024","start":"1025","end":"1028","total":"1066","clock":60.02},"horizontal":{"width":"1280","start":"1328","end":"1440","total":"1688","skew":"0","clock":63.98}}},{"name":"1152x864","width":"1152","height":"864","rate":108,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"864","start":"865","end":"868","total":"900","clock":75},"horizontal":{"width":"1152","start":"1216","end":"1344","total":"1600","skew":"0","clock":67.5}}},{"name":"1280x720","width":"1280","height":"720","rate":74.25,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":60},"horizontal":{"width":"1280","start":"1390","end":"1430","total":"1650","skew":"0","clock":45}}},{"name":"1280x720","width":"1280","height":"720","rate":74.25,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":50},"horizontal":{"width":"1280","start":"1720","end":"1760","total":"1980","skew":"0","clock":37.5}}},{"name":"1280x720","width":"1280","height":"720","rate":74.176,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"720","start":"725","end":"730","total":"750","clock":59.94},"horizontal":{"width":"1280","start":"1390","end":"1430","total":"1650","skew":"0","clock":44.96}}},{"name":"1024x768","width":"1024","height":"768","rate":78.8,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"768","start":"769","end":"772","total":"800","clock":75.08},"horizontal":{"width":"1024","start":"1040","end":"1136","total":"1312","skew":"0","clock":60.06}}},{"name":"1024x768","width":"1024","height":"768","rate":65,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"768","start":"771","end":"777","total":"806","clock":60},"horizontal":{"width":"1024","start":"1048","end":"1184","total":"1344","skew":"0","clock":48.36}}},{"name":"800x600","width":"800","height":"600","rate":49.5,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"600","start":"601","end":"604","total":"625","clock":75},"horizontal":{"width":"800","start":"816","end":"896","total":"1056","skew":"0","clock":46.88}}},{"name":"800x600","width":"800","height":"600","rate":40,"optionals":"+HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"600","start":"601","end":"605","total":"628","clock":60.32},"horizontal":{"width":"800","start":"840","end":"968","total":"1056","skew":"0","clock":37.88}}},{"name":"720x576","width":"720","height":"576","rate":27,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"576","start":"581","end":"586","total":"625","clock":50},"horizontal":{"width":"720","start":"732","end":"796","total":"864","skew":"0","clock":31.25}}},{"name":"720x480","width":"720","height":"480","rate":27.027,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"489","end":"495","total":"525","clock":60},"horizontal":{"width":"720","start":"736","end":"798","total":"858","skew":"0","clock":31.5}}},{"name":"720x480","width":"720","height":"480","rate":27,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"489","end":"495","total":"525","clock":59.94},"horizontal":{"width":"720","start":"736","end":"798","total":"858","skew":"0","clock":31.47}}},{"name":"640x480","width":"640","height":"480","rate":31.5,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"481","end":"484","total":"500","clock":75},"horizontal":{"width":"640","start":"656","end":"720","total":"840","skew":"0","clock":37.5}}},{"name":"640x480","width":"640","height":"480","rate":25.2,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"490","end":"492","total":"525","clock":60},"horizontal":{"width":"640","start":"656","end":"752","total":"800","skew":"0","clock":31.5}}},{"name":"640x480","width":"640","height":"480","rate":25.175,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"480","start":"490","end":"492","total":"525","clock":59.94},"horizontal":{"width":"640","start":"656","end":"752","total":"800","skew":"0","clock":31.47}}},{"name":"720x400","width":"720","height":"400","rate":28.32,"optionals":"-HSync ","current":false,"preferred":false,"dimensions":{"vertical":{"width":"400","start":"412","end":"414","total":"449","clock":70.08},"horizontal":{"width":"720","start":"738","end":"846","total":"900","skew":"0","clock":31.47}}}],"index":0,"width":1050,"height":1680,"left":0,"top":0},
    };*/

    callback(result);
}

function zik() {
    console.log("Zik")
}
