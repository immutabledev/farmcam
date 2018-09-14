"use strict";

// Read configuration
var fs = require("fs"),
    cam = require('node-dahua-api');
    https = require('https'),
    WebSocket = require('ws'),
    express = require('express'),
    app = express(),
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
	SOCKETIO_PORT = 8183,
        RECORD_STREAM = false;

var camOptions = {
	host	: IP,
	port 	: PORT, 
	user 	: USER,
	pass 	: PASS,
	log 	: false
};
var CAMSPEED = '4';
var CAMDELAYMS = '200';
console.log("Connecting to Camera: "+URL);
var camera = new cam.dahua(camOptions);

const key = fs.readFileSync('certs/key.pem');
const cert = fs.readFileSync('certs/cert.pem');
const ca = fs.readFileSync('certs/chain.pem');

// SocketIO Server
const httpsIO = require('https').createServer({
        key: key,
        cert: cert,
        ca: ca
    }, app);
const io = require('socket.io').listen(httpsIO);

// Websocket Server
const httpsServer = https.createServer({
        key: key,
        cert: cert,
        ca: ca
    }).listen(WEBSOCKET_PORT);

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

io.on('connection', function(socket){
  socket.on('moveLeft', function() {
    console.log('Move left.');
    moveCam('Left');
  });
  socket.on('moveRight', function() {
    console.log('Move right.');
    moveCam('Right');
  });
  socket.on('moveUp', function() {
    console.log('Move up.');
    moveCam('Up');
  });
  socket.on('moveDown', function() {
    console.log('Move down.');
    moveCam('Down');
  });
  socket.on('zoomIn', function() {
    console.log('Zoom in.');
    zoomIn();
  });
  socket.on('zoomOut', function() {
    console.log('Zoom out.');
    zoomOut();
  });
  socket.on('gotoPreset', function(preset) {
    console.log('Goto Preset: '+preset);
    gotoPreset(preset);
  });
  socket.on('getPTZ', function(callback) {
    console.log('Get PTZ.');
    callback(camera.ptzStatus());
  });
  socket.on('getWeather', function(callback) {
    console.log('Get weather.');
    forecast.get([conf.weather_lat,conf.weather_lon], function(err, weather) {
      callback(json(weather);
    });
  });
});

function moveCam(dir) {
	camera.ptzMove(dir, 'start', CAMSPEED).then(function() {
                setTimeout(function() {
                        camera.ptzMove(dir, 'stop', CAMSPEED)
                        .then(function(result) {
				return true;
                        })
                        .catch(function(result) {
				return false;
                        });
                }, CAMDELAYMS);
        });
}

function zoomIn() {
	camera.ptzZoom(1.0);
	return true;
}

function zoomOut() {
	camera.ptzZoom(-1.0);
	return true;
}

function gotoPreset(preset) {
	camera.ptzPreset(preset);
}
