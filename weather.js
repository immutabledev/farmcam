"use strict";

// Read configuration
var fs = require("fs"),
    https = require('https'),
    express = require('express'),
    app = express(),
    cors = require('cors'),
    Forecast = require('forecast');

var conf = JSON.parse(fs.readFileSync("config.json"));

const key = fs.readFileSync('certs/privkey.pem');
const cert = fs.readFileSync('certs/cert.pem');
const ca = fs.readFileSync('certs/chain.pem');

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
