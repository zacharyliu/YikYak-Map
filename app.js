var express = require('express');
var path = require('path');
var https = require('https');
var async = require('async');
var _ = require('lodash');
var rest = require('restler');

//var favicon = require('serve-favicon');
//var logger = require('morgan');
//var cookieParser = require('cookie-parser');
//var bodyParser = require('body-parser');

//var routes = require('./routes/index');
//var users = require('./routes/users');

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost/yakbattle3');

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
    res.json(schools);
});

api.get('/all', function(req, res) {
    Message.find({}, function(err, messages) {
        res.json(messages);
    });
});

api.get('/new', function(req, res) {
    Message.find({
        loc_lastUpdated: {
            $gte: new Date(req.query.since)
        },
        schoolName: req.query.schoolName
    }, function(err, messages) {
        res.json(messages);
    });
});

api.get('/yo', function(req, res) {
    var username = req.query.username;
    var location = req.query.location.split(";");
    console.log("Yo from " + username + " @ " + location[0] + ", " + location[1]);
    var twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);
    Message.find({
        time: {
            $gte: twelveHoursAgo
        },
        loc: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: [location[1], location[0]]
                }
            }
        }
    }).limit(20).exec(function(err, messages) {
        var text = "";
        for (var i=0; i<messages.length; i++) {
            text = text + " " + messages[i].message;
        }

        rest.post('http://cloudmaker.gatheringpoint.com/index.php', {
            data: { textblock: text }
        }).on('complete', function(data) {
            var link = JSON.parse(data).url;
            console.log("Sending Yo to " + username + ": " + link);
            rest.post('https://api.justyo.co/yo/', {
                data: {
                    api_token: process.env.YO,
                    username: username,
                    link: link
                }
            });
        });
    });
    res.end();
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
var io = require('socket.io')(server);


function getYaks(latitude, longitude, schoolName, callback) {
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
            async.map(data.messages, function(message, done) {
                Message.addOrUpdate(message, schoolName, function(err, message, status) {
                    if (err) {
                        done(err);
                    } else {
                        if (status.isNew) {
                            newCount++;
                        }
                        if (status.isUpdated) {
                            updatedCount++;
                        }
                        if (status.isFound) {
//                            io.sockets.emit('message_found', message);
                            io.to(schoolName).emit('message_found', message);
                        }
                        done(null, message);
                    }
                });
            }, function(err, messages) {
                callback(err, newCount, updatedCount, messages);
            });
        });
    }).on('error', function(e) {
        console.log("Got error: ", e);
    });
}

function refresh() {
    async.map(schools, function(school, done) {
        getYaks(school.loc[1], school.loc[0], school.name, function (err, newCount, updatedCount, messages) {
            if (err) {
                console.log(err);
            } else {
                console.log(school.name + ": " + newCount + " new, " + updatedCount + " updated");
            }
            done(err, {
                newOrUpdatedCounts: newCount + updatedCount,
                messages: messages
            });
            io.to(school.name).emit('messages', messages);
        });
    }, function(err, result) {
        // Determine delay until next update
        var newOrUpdatedCount = 0;
        var messages = [];
        for (var i=0; i<result.length; i++) {
            newOrUpdatedCount += result[i].newOrUpdatedCounts;
            messages = messages.concat(result[i].messages);
        }

        var pastDay = new Date();
        pastDay.setHours(pastDay.getHours() - 24);
        Message.aggregate({
            $match: {
                time: {
                    $gte: pastDay
                }
            }
        }, {
            $group: {
                _id: "$schoolName",
                averageScore: {
                    $avg: "$numberOfLikes"
                },
                count: {
                    $sum: 1
                }
            }
        }, function(err, results) {
            io.sockets.emit('schoolStats', results);
        });

        var delay = (newOrUpdatedCount == 0) ? 1000 : 500;
        setTimeout(function() {
            refresh();
        }, delay);

//        io.sockets.emit('messages', messages);
    });
}

refresh();

io.sockets.on('connection', function (socket) {
    socket.on('subscribe', function(data) { socket.join(data.room); })
    socket.on('unsubscribe', function(data) { socket.leave(data.room); })
});
