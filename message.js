var mongoose = require('mongoose');

var messageSchema = new mongoose.Schema({
    messageID: String,
    message: String,
    loc: {
        index: '2dsphere',
        type: [Number]
    },
    time: Date,
    numberOfLikes: Number
});

var EMA_THRESHOLD = 1;

messageSchema.statics.addOrUpdate = function(data, callback) {
    var _this = this;
    _this.findOne({messageID: data.messageID}, function(err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            result.update({
                numberOfLikes: data.numberOfLikes,
                loc: [
                    result.loc[0] * EMA_THRESHOLD + data.longitude * (1-EMA_THRESHOLD),
                    result.loc[1] * EMA_THRESHOLD + data.latitude * (1-EMA_THRESHOLD)
                ]
            }, function(err) {
                callback(err, result, true);
            });
        } else {
            var message = new _this({
                messageID: data.messageID,
                message: data.message,
                loc: [data.longitude, data.latitude],
                time: new Date(data.time),
                numberOfLikes: data.numberOfLikes
            });
            message.save(function(err) {
                callback(err, message, false);
            })
        }
    });
};

module.exports = mongoose.model('message', messageSchema);
