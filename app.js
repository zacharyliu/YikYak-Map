var express = require('express');
var path = require('path');
var https = require('https');
var async = require('async');
var _ = require('lodash');
//var favicon = require('serve-favicon');
//var logger = require('morgan');
//var cookieParser = require('cookie-parser');
//var bodyParser = require('body-parser');

//var routes = require('./routes/index');
//var users = require('./routes/users');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGOLAB_URI || 'mongodb://localhost/yakbattle2');

var Message = require('./message');

var schools = require('./schools');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
//app.use(logger('dev'));
//app.use(bodyParser.json());
//app.use(bodyParser.urlencoded({ extended: false }));
//app.use(cookieParser());
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

var api = express.Router();

/* GET home page. */
api.get('/schools', function(req, res) {
    res.render('index', { title: 'Express' });
});

api.get('/schools/:schoolID/sections', function(req, res) {

});

api.get('/schools/:schoolID/sections/:sectionID/versus/:versusSectionID', function(req, res) {

});

api.get('/all', function(req, res) {
    Message.find({}, function(err, messages) {
        res.json(messages);
    });
});

api.get('/new', function(req, res) {
    Message.find({
        loc_lastUpdated: {
            $gte: new Date(req.params.since)
        }
    }, function(err, messages) {
        res.json(messages);
    });
});

app.use('/api', api);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


app.set('port', process.env.PORT || 3000);

var server = app.listen(app.get('port'), function() {
    console.log('Express server listening on port ' + server.address().port);
});


function getYaks(latitude, longitude, callback) {
    var url = 'https://us-east-api.yikyakapi.net/api/getMessages?lat=' + latitude + '&long=' + longitude + '&userID=81282DCE4E540935E9C9D81222CDC7F5';
    https.get(url, function(res) {
        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            var data = JSON.parse(body);
            var newCount = 0;
            var updatedCount = 0;
            async.each(data.messages, function(message, done) {
                Message.addOrUpdate(message, function(err, message, isUpdated) {
                    if (err) {
                        done(err);
                    } else {
                        if (isUpdated) {
                            updatedCount++;
                        } else {
                            newCount++;
                        }
                        done();
                    }
                });
            }, function(err) {
                callback(err, newCount, updatedCount);
            });
        });
    }).on('error', function(e) {
        console.log("Got error: ", e);
    });
}

function refresh() {
    async.each(schools, function(school, done) {
        getYaks(school.loc[1], school.loc[0], function (err, newCount, updatedCount) {
            if (err) {
                console.log(err);
            } else {
                console.log(school.name + ": " + newCount + " new, " + updatedCount + " updated");
            }
            done();
        });
    }, function(err) {
//        Message.findOne({messageID: "R/5454e54051ac1c8f44974e76cc9c2"}, function(err, message) {
//            console.log(message.loc[1] + "\t" + message.loc[0]);
//        });
        // Determine delay until next update
        Message.count({loc_found: false}, function(err, count) {
            console.log(count);
            var delay = (count == 0) ? 5000 : 500;
            setTimeout(function() {
                refresh();
            }, delay);
        });
    });
}

refresh();
