"use strict";

// Read configuration
var fs = require("fs"),
    spawn = require('child_process').spawn,
    Foscam = require('foscam-client'),
    https = require('https'),
    http = require('http'),
    WebSocket = require('ws'),
    express = require('express'),
    app = express(),
    cors = require('cors'),
    exec = require('child_process').exec,
    Forecast = require('forecast');

var conf = JSON.parse(fs.readFileSync("config.json"));

// Setup URL for camera video stream
var IP = conf.cam_ip;
var PORT = conf.cam_port;
var USER = conf.cam_user;
var PASS = conf.cam_pass;
var URL = 'rtsp://'+USER+':'+PASS+'@'+IP+':'+PORT+'/videoSub';

var STREAM_SECRET = "farmcam",
        STREAM_PORT = 8081,
        WEBSOCKET_PORT = 8082,
        RECORD_STREAM = false;


console.log("Connecting to Camera: "+URL);

const key = fs.readFileSync('certs/key.pem');
const cert = fs.readFileSync('certs/cert.pem');
const ca = fs.readFileSync('certs/chain.pem');

// Websocket Server
const httpsServer = https.createServer({
        key: key,
        cert: cert,
        ca: ca
    }).listen(WEBSOCKET_PORT);

//var socketServer = new WebSocket.Server({server: httpsServer, perMessageDeflate: false});
var socketServer = new WebSocket.Server( {server: httpsServer} );
socketServer.connectionCount = 0;
socketServer.on('connection', function(socket, upgradeReq) {
        socketServer.connectionCount++;
        console.log(
                'New WebSocket Connection: ',
                (upgradeReq || socket.upgradeReq).socket.remoteAddress,
                (upgradeReq || socket.upgradeReq).headers['user-agent'],
                '('+socketServer.connectionCount+' total)'
        );
        socket.on('close', function(code, message){
                socketServer.connectionCount--;
                console.log(
                        'Disconnected WebSocket ('+socketServer.connectionCount+' total)'
                );
        });
});
socketServer.broadcast = function(data) {
        socketServer.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                        client.send(data);
                }
        });
};

// HTTP Server to accept incomming MPEG-TS Stream from ffmpeg
var streamServer = http.createServer( function(request, response) {
        var params = request.url.substr(1).split('/');

        if (params[0] !== STREAM_SECRET) {
                console.log(
                        'Failed Stream Connection: '+ request.socket.remoteAddress + ':' +
                        request.socket.remotePort + ' - wrong secret.'
                );
                response.end();
        }

        response.connection.setTimeout(0);
        console.log(
                'Stream Connected: ' +
                request.socket.remoteAddress + ':' +
                request.socket.remotePort
        );
        request.on('data', function(data){
                socketServer.broadcast(data);
                if (request.socket.recording) {
                        request.socket.recording.write(data);
                }
        });
        request.on('end',function(){
                console.log('close');
                if (request.socket.recording) {
                        request.socket.recording.close();
                }
        });

        // Record the stream to a local file?
        if (RECORD_STREAM) {
                var path = 'recordings/' + Date.now() + '.ts';
                request.socket.recording = fs.createWriteStream(path);
        }
}).listen(STREAM_PORT);

// Create the stream from the camera
/*
var cmd = '/usr/bin/ffmpeg';

var args = [
    '-i', URL,
    '-err_detect', 'ignore_err',
    '-f', 'mpegts',
    '-codec:v', 'mpeg1video',
    '-bf', '0',
    '-b:v', '180k',
    '-r', '24',
    '-codec:a', 'mp2',
    '-ar', '44100',
    'http://127.0.0.1:8081/farmcam'
];

var proc = spawn(cmd, args);

proc.stderr.on('data', function(data) {
    console.log("[ffmpeg] "+data);
});
*/

// Setup camera control
var camera = new Foscam({
  username: conf.cam_control_user,
  password: conf.cam_control_pass,
  host: IP,
  port: PORT, // default
  protocol: 'http', // default
  rejectUnauthorizedCerts: true // default
});

https.createServer({
      key: key,
      cert: cert,
      ca: ca 
    }, app).listen(6999);

var whitelist = ['http://'+conf.domain, 'http://www.'+conf.domain, 'https://'+conf.domain, 'https://www.'+conf.domain];
var corsOptions = {
  origin: function(origin, callback){
    var originIsWhitelisted = whitelist.indexOf(origin) !== -1;
    callback(null, originIsWhitelisted);
  }
};

var forceRestartCmd = conf.restart_cmd;
var lastRestarted = Date.now();

// Define POST URLs
app.post('/move/left', cors(corsOptions), function(req, res) {
	camera.ptzMoveLeft().then(function() {
		setTimeout(function() {
                                camera.ptzStopRun()
                                    .then(function(result) {
                                        //resolve(result);
					res.send(req.body);
                                    })
                                    .catch(function(result) {
                                        //reject(result);
                                    });
                            }, 200);
	});
});

app.post('/move/right', cors(corsOptions), function(req, res) {
        camera.ptzMoveRight().then(function() {
                setTimeout(function() {
                                camera.ptzStopRun()
                                    .then(function(result) {
                                        //resolve(result);
					res.send(req.body);
                                    })
                                    .catch(function(result) {
                                        //reject(result);
                                    });
                            }, 200);
        });
});

app.post('/move/up', cors(corsOptions), function(req, res) {
        camera.ptzMoveUp().then(function() {
                setTimeout(function() {
                                camera.ptzStopRun()
                                    .then(function(result) {
                                        //resolve(result);
                                        res.send(req.body);
                                    })
                                    .catch(function(result) {

                                        //reject(result);
                                    });
                            }, 200);
        });
});

app.post('/move/down', cors(corsOptions), function(req, res) {
        camera.ptzMoveDown().then(function() {
                setTimeout(function() {
                                camera.ptzStopRun()
                                    .then(function(result) {
                                        //resolve(result);
                                        res.send(req.body);
                                    })
                                    .catch(function(result) {

                                        //reject(result);
                                    });
                            }, 200);
        });
});

app.post('/preset/pond', cors(corsOptions), function(req, res) {
	camera.ptzGotoPresetPoint('Pond');
	res.send(req.body);
});

app.post('/preset/goatdeck', cors(corsOptions), function(req, res) {
        camera.ptzGotoPresetPoint('GoatDeck');
	res.send(req.body);
});

app.post('/preset/bluecottage', cors(corsOptions), function(req, res) {
        camera.ptzGotoPresetPoint('BlueCottage');
        res.send(req.body);

});

app.post('/restart_cam', cors(corsOptions), function(req, res) {
	var rn = Date.now();
	console.log("Restart Requested: ["+rn+"]["+lastRestarted+"]");
	if ((rn - lastRestarted)  > 5000) {
		lastRestarted = rn; 
		exec(forceRestartCmd, function(error, stdout, stderr) {
			console.log("Restart commanded!");
			res.send(req.body);
		});
	} else {
		res.send(req.body);
	}
});

// Configure weather
var forecast = new Forecast({
  service: 'forecast.io',
  key: conf.forecastio_key,
  units: 'f', // Only the first letter is parsed 
  cache: true,      // Cache API requests? 
  ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/ 
    minutes: 5,
    seconds: 0 
    }
});

// Make weather data available via GET
app.get('/forecast', cors(corsOptions), function(req, res) {
	forecast.get([conf.weather_lat,conf.weather_lon], function(err, weather) {
		if(err) return res.send(err);
		res.json(weather);
	});
});
