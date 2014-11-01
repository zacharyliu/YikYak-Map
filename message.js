var mongoose = require('mongoose');

var messageSchema = new mongoose.Schema({
    messageID: String,
    message: String,
    loc: {
        index: '2dsphere',
        type: [Number]
    },
    loc_covariance: {
        type: Number,
        default: 1
    },
    time: Date,
    numberOfLikes: Number
});

var STANDARD_DEVIATION = 0.011710113; // determined experimentally

messageSchema.statics.addOrUpdate = function(data, callback) {
    var _this = this;
    _this.findOne({messageID: data.messageID}, function(err, result) {
        if (err) {
            callback(err);
        } else if (result) {
            // Kalman filtering http://bilgin.esme.org/BitsBytes/KalmanFilterforDummies.aspx
            var kalmanGain = result.loc_covariance / (result.loc_covariance + STANDARD_DEVIATION);
            var newLatitude = result.loc[1] + kalmanGain * (data.latitude - result.loc[1]);
            var newLongitude = result.loc[0] + kalmanGain * (data.longitude - result.loc[0]);
            var newCovariance = (1 - kalmanGain) * result.loc_covariance;

            result.update({
                numberOfLikes: data.numberOfLikes,
                loc: [
                    newLongitude,
                    newLatitude
                ],
                loc_covariance: newCovariance
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
