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

messageSchema.statics.addOrUpdate = function(data, callback) {
    var _this = this;
    _this.findOne({messageID: data.messageID}, function(err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            result.update({numberOfLikes: data.numberOfLikes}, function(err) {
                callback(err, result);
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
                callback(err, message);
            })
        }
    });
};

module.exports = mongoose.model('message', messageSchema);
