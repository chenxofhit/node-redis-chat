var mongoose = require("./connect");

var Schema = mongoose.Schema;

var Memeber_Schema = new Schema({
  _id: String,
  nickname: String,
  avatar: String,
  onlineStatus: Number,
  createtime: Date,
  opertime: Date
}, {
  versionKey: false
}); 


var MyMember = mongoose.model("member", Memeber_Schema,"member");

module.exports.MyMember = MyMember;