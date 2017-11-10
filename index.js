var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var assert = require('assert');
var _ = require('lodash');
var async = require("async");

var Promise = require("bluebird");
var redis = Promise.promisifyAll(require("redis"));


var myMember = require("./mongoose").MyMember;
var client = '';

require('fs').readFile('env.json', 'utf-8', function(err, data) {
    if (err) throw err;
    conf = JSON.parse(data);
    client = redis.createClient('redis://' + conf.redis.username + ':' + conf.redis.password + '@' + conf.redis.host + ':' + conf.redis.port);

    client.once('ready', function() {
        // Flush Redis DB
        //client.flushdb();

        console.log("connect to redis successfully.");
        // Initialize Chatters
        client.get('chat_users', function(err, reply) {
            if (reply) {
                chatters = JSON.parse(reply);
            }
        });

        // Initialize Messages
        client.get('chat_app_messages', function(err, reply) {
            if (reply) {
                chat_messages = JSON.parse(reply);
            }
        });
    });
});

var port = process.env.PORT || 8080;

// Start the Server
http.listen(port, function() {
    console.log('Server Started. Listening on *:' + port);
    console.log('Init Members...' + initMembers());
});

// Store people in chatroom
var chatters = [];

// Store messages in chatroom
var chat_messages = [];

// Express Middleware
app.use(express.static('public'));
app.use(bodyParser.urlencoded({
    extended: true
}));

// Render Main HTML file
app.get('/', function(req, res) {
    res.sendFile('views/index.html', {
        root: __dirname
    });
});

// API - Join Chat
app.post('/join.json', function(req, res) {
    var username = req.body.username;
    if (chatters.indexOf(username) === -1) {
        chatters.push(username);
        client.set('chat_users', JSON.stringify(chatters));
        res.send({
            'chatters': chatters,
            'status': 'OK'
        });
    } else {
        res.send({
            'status': 'FAILED'
        });
    }
});

function initMembers() {
    myMember.find({}, function(err, members) {
        console.log(members.length);
        for (var i = 0; i < members.length; i++) {
            client.set(members[i]._id + ":m", JSON.stringify(members[i]));
        }
    })
}

function getConversationId(fid, tid) {
    var conversationid = fid + "_" + tid;
    if (tid > fid) {
        conversationid = tid + "_" + fid;
    }
    return conversationid;
};

function getAnotherId(conversationid, fid) {
    var s = conversationid.split("_");
    return s[0] == fid ? s[1] : s[0];
};

// API - 离开
app.post('/leave.json', function(req, res) {
    var username = req.body.username;
    chatters.splice(chatters.indexOf(username), 1);
    client.set('chat_users', JSON.stringify(chatters));
    res.send({
        'status': 'OK'
    });
});

// API - 发送消息
app.post('/send_message.json', function(req, res) {
    var fid = req.body.fid;
    var fname = req.body.fname;
    var tid = req.body.tid;
    var tname = req.body.tname;
    var msg = req.body.msg;
    var timestamp = Date.now();

    var conversationId = getConversationId(fid, tid);
    var ctid = conversationId + "-" + tid + ":unread";

    //设置未读消息数目
    client.get(ctid, function(err, data) {
        if (data) {
            var redisData = JSON.parse(data);
            if (redisData === null) {
                client.set(ctid, redisData);
            } else {
                redisData++;
                client.set(ctid, redisData);
            }
        } else {
            client.set(ctid, 1);
        };
    });

    //设置活动会话集
    client.zadd(fid + ":active", timestamp, conversationId);
    client.zadd(tid + ":active", timestamp, conversationId);

    var redisMsg = JSON.stringify({
        'fid': fid,
        'fname': fname,
        'tid': tid,
        'tname': tname,
        'msg': msg,
        't': timestamp
    });
    //设置消息队列
    client.lpush(conversationId, redisMsg);
    client.llen(conversationId, function(err, reply) {
        if (err) throw err;
        var len = Number(reply);
        res.send({
            'status': 'OK',
            't': timestamp,
            'len': len
        });
    });
});



// API - 获取所有对话(包括其未读数)
app.get('/get_all_conversations.json', function(req, res) {
    var fid = req.query.fid;
    var activeId = fid + ":active";

    client.ZREVRANGE(activeId, 0, -1, 'WITHSCORES', function(err, actives) {
        if (err) throw err;
        tids = [];
        tnames = [];
        t = [];
        unread = [];

        if (!actives.length) {
            res.send({
                status: 'OK',
                tids: tids,
                tnames: tnames,
                t: t,
                unread: unread
            });
        }

        activesArr = _.chunk(actives, 2);

        var inserted = 0;
        for (var i = 0; i < activesArr.length; i++) {
            (function(j) {
                console.log("active " + i + " ->>>" + activesArr[i] + ", conversationid = " + conversationid + ", tid = " + tid);
                var conversationid = activesArr[j][0];
                var tid = getAnotherId(conversationid, fid);

                client.get(tid + ":m", function(err, data) {
                    if (data !== null) {

                        console.log("id conversations :" + data);

                        var json = JSON.parse(data);
                        var tname = json["nickname"];


                        var ctid = conversationid + "-" + fid + ":unread";
                        (function(tname) {
                            console.log("tname:" + tname);
                            client.get(ctid, function(err, data) {
                                if (err) throw err;;
                                if (data) {
                                    tn = (Number(data));
                                } else {
                                    tn = 0;
                                }

                                console.log("goactive " + j + " ->>>" + activesArr[j] + ", conversationid = " + conversationid);

                                unread.push(tn);
                                tnames.push(tname);
                                tids.push(tid);
                                t.push(activesArr[j][1]);

                                console.log(inserted);

                                if (++inserted == activesArr.length) {
                                    res.send({
                                        status: 'OK',
                                        tids: tids,
                                        tnames: tnames,
                                        t: t,
                                        unread: unread
                                    });
                                }
                            })
                        })(tname);
                    }
                })
            })(i);
        }
    })
});

// API - 获取对话的所有消息
app.get('/get_all_messages.json', function(req, res) {
    var conversationId = req.query.conversationId;
    var fid = req.query.fid;

    var ctid = conversationId + "-" + fid + ":unread";

    //设置未读消息数目清零
    client.get(ctid, function(err, data) {
        client.set(ctid, 0);
    });

    client.llen(conversationId, function(err, reply) {
        if (err) throw err;
        var len = Number(reply);
        var history = [];
        if (len > 0) {

            client.lrange(conversationId, 0, -1, function(err, conversations) {
                if (err) throw err;
                conversations.forEach(function(conversation) {
                    history.push(conversation);
                });
                res.send({
                    'history': history,
                    'totalnum': len,
                    'status': 'OK'
                });
            });

        } else {
            res.send({
                'history': history,
                'totalnum': 0,
                'status': 'OK'
            });
        }
    });

});

// API - 获取分页消息
app.get('/get_messages.json', function(req, res) {
    var conversationId = req.query.conversationId;
    var fid = req.query.fid;
    var pagenum = Number(req.query.pagenum);
    var pagesize = Number(req.query.pagesize);

    var ctid = conversationId + "-" + fid + ":unread";

    client.llen(conversationId, function(err, reply) {
        if (err) throw err;
        var len = Number(reply);
        var history = [];
        if (len > 0) {
            var begin = 0;
            var end = pagenum * pagesize > len ? len - 1 : pagenum * pagesize - 1;
            console.log(begin + " - > " + end);

            //设置未读消息数目
            client.get(ctid, function(err, data) {
                if (data) {
                    var redisData = JSON.parse(data);
                    if (redisData === null) {
                        client.set(ctid, 0);
                    } else {
                        redisData = redisData - pagesize;
                        if (redisData < 0) {
                            redisData = 0;
                        }
                        client.set(ctid, redisData);
                    }
                }
            });

            client.lrange(conversationId, begin, end, function(err, conversations) {
                if (err) throw err;
                conversations.forEach(function(conversation) {
                    history.push(conversation);
                });
                res.send({
                    'history': history,
                    'totalnum': len,
                    'status': 'OK'
                });
            });

        } else {
            res.send({
                'history': history,
                'totalnum': 0,
                'status': 'OK'
            });
        }
    });
});

//API 获取所有的用户
app.get('/get_all_chatters.json', function(req, res) {
    var all_chatters = [];

    client.keys('*:m', function(err, keys) {
        if (err) throw err;
        var inserted = 0;
        for (var i = 0, len = keys.length; i < len; i++) {
            client.get(keys[i], function(err, data) {
                if (err) throw err;
                console.log(data);
                all_chatters.push(JSON.parse(data));

                if (++inserted == len) {
                    res.send(all_chatters);
                }

            });


        }
    });


});

// Socket Connection
// UI Stuff
var users = {};

var userSockets = {};

io.on('connection', function(socket) {

    console.log('io connected.');

    socket.on('join', function(data) {
        var uid = data.uid;
        console.log(uid + " join in the server...");
        userSockets[uid] = socket;
    })


    socket.on('disconnect', function() {
        console.log(' user disconnected.');
        //TODO delete the socket from the array


    });


    // Fire 'send' event for updating Message list in UI
    socket.on('message', function(data) {
        console.log("Recieved data from cient ->>>: " + data);
        var json = JSON.parse(data);
        var tid = json.tid;
        var fid = json.fid;
        var conversationId = getConversationId(fid, tid);
        var ctid = conversationId + "-" + tid + ":unread";

        if (tid in userSockets) { //如果目标用户在线则直接通知未读消息数目
            client.get(ctid, function(err, data) {
                if (data) {
                    userSockets[tid].emit('message-count', data);
                    console.log("tid: " + tid + " is online, unknown messages with num =" + data + " notifed");
                }
            });
        } else { //如果目标用户不在线则走离线通知
            console.log("tid: " + tid + "is not online at the moment...");
        }

    });


    // Fire 'count_chatters' for updating Chatter Count in UI
    socket.on('update_chatter_count', function(data) {
        console.log("Recieved data from cient ->>>: " + data);
        io.emit('message', ' socket io is connected');

        //io.emit('count_chatters', data);
    });

});