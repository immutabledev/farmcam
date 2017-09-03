// Read configuration
var fs = require("fs");
var conf = JSON.parse(fs.readFileSync("config.json"));

// Setup URL for camera video stream
var IP = conf.cam_ip;
var PORT = conf.cam_port;
var USER = conf.cam_user;
var PASS = conf.cam_pass;
var URL = 'rtsp://'+USER+':'+PASS+'@'+IP+':'+PORT+'/videoMain';

console.log("Connecting to Camera: "+URL);

Stream = require('node-rtsp-stream');
stream = new Stream({
    name: 'farmcam',
    streamUrl: URL,
    wsPort: 6968
});

// Setup camera control
var Foscam = require('foscam-client');
 
var camera = new Foscam({
  username: conf.cam_control_user,
  password: conf.cam_control_pass,
  host: IP,
  port: 88, // default
  protocol: 'http', // default
  rejectUnauthorizedCerts: true // default
});

var express = require('express')
  , cors = require('cors')
  , app = express();

var whitelist = ['http://'+conf.domain, 'http://www.'+conf.domain];
var corsOptions = {
  origin: function(origin, callback){
    var originIsWhitelisted = whitelist.indexOf(origin) !== -1;
    callback(null, originIsWhitelisted);
  }
};

var exec = require('child_process').exec;
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
var Forecast = require('forecast');
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

app.listen(6999);
