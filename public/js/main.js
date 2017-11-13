$(function() {
    $.fn.scrollBottom = function() {
        return $(document).height() - this.scrollTop() - this.height();
    };
    var socket = io();
    var chatter_count;
    var tid;
    var tname;

    var fid = "XktmCFsJhXzs8PuoIL2";
    var fname = "talkeer-service";

    var searchFilter = {
        options: {
            valueNames: ['nickname']
        },
        init: function() {
            var userList = new List('people-list', this.options);
            var noItems = $('<li id="no-items-found">No items found</li>');

            userList.on('updated', function(list) {
                if (list.matchingItems.length === 0) {
                    $(list.list).append(noItems);
                } else {
                    noItems.detach();
                }
            });
        }
    };

    var chat = {

        init: function() {
            this.cacheDOM();
            this.bindEvents();
            this.getConversations();
        },
        cacheDOM: function() {
            this.$chatHistory = $('.chat-history');
            this.$button = $('button');
            this.$textarea = $('#message-to-send');
            this.$chatHistoryList = this.$chatHistory.find('ul');
        },
        bindEvents: function() {
            this.$button.on('click', this.addMessage.bind(this));
            this.$textarea.on('keyup', this.addMessageEnter.bind(this));

            //bind tab switch event
            $('a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
                var activeTab = $(e.target).text();
                if (activeTab == "Recent") {
                    chat.getConversations();
                } else {
                    if (activeTab == "Contact") {
                        chat.getContact();
                    }
                }
            });
        },

        scrollToBottom: function() {
            this.$chatHistory.scrollTop(this.$chatHistory[0].scrollHeight);
        },

        scrollToTop: function() {
            this.$chatHistory.scrollBottom();
        },


        addMessage: function() {
            var messageToSend = $.trim(this.$textarea.val());
            if (messageToSend.length == 0) {
                alert("blank  message not allowed");
                return;
            }
            $.ajax({
                url: '/send_message.json',
                type: 'POST',
                dataType: 'json',
                data: {
                    'fid': fid,
                    'fname': fname,
                    'tid': tid,
                    'tname': tname,
                    'msg': messageToSend
                },
                success: function(response) {
                    if (response.status == 'OK') {
                        var json = JSON.stringify({
                            fid: fid,
                            fname: fname,
                            tid: tid,
                            tname: tname,
                            msg: messageToSend
                        });

                        //通过socket发送消息
                        socket.emit('message', json);

                        var templateResponse = Handlebars.compile($("#message-response-template").html());
                        var contextResponse = {
                            response: messageToSend,
                            time: new Date(response.t).toLocaleString()
                        };

                        $(".page-chat-history").append(templateResponse(contextResponse));
                        $(".chat-num-messages").empty().append("already have " + response.len + " messages");
                        $('#message-to-send').val('').focus();

                    }
                    chat.scrollToBottom();
                }
            });
        },

        addMessageEnter: function(event) {
            // enter was pressed
            if (event.keyCode === 13) {
                this.addMessage();
            }
        },



        getCurrentTime: function() {
            return new Date().toLocaleTimeString().
            replace(/([\d]+:[\d]{2})(:[\d]{2})(.*)/, "$1$3");
        },

        getConversationId: function(fid, tid) {
            var conversationid = fid + "_" + tid;
            if (tid > fid) {
                conversationid = tid + "_" + fid;
            }
            return conversationid;
        },

        getAnotherId: function(conversationid, fid) {
            var s = conversationid.split("_");
            return s[0] == fid ? s[1] : s[0];
        },

        bindChat: function() {

            $(".people-list ul li").bind("dblclick", function(event) {
                $(this).addClass("selected").siblings().removeClass("selected");
                var item = $(this).index();

                var chatwith = $(this).find(".nickname")[0].innerHTML;

                tid = $(this).find(".id")[0].innerHTML;
                tname = $(this).find(".nickname")[0].innerHTML;

                conversationId = chat.getConversationId(fid, tid);

                //update chat history ui
                var chatImg = $(".chat-header").find("img")[0];
                chatImg.setAttribute("src",$(this).find("img")[0].getAttribute('src'));

                $(".chat-with").empty().append("Chat with " + chatwith);
                $(".chat-num-messages").empty().append("no more messages");
                $(".page-chat-history").empty();

                pagenum = 1;
                pagesize = 10;

                $.ajax({
                    url: '/get_messages.json',
                    type: 'get',
                    dataType: 'json',
                    data: {
                        conversationId: conversationId, //会话id
                        fid: fid, //发出请求的ID（自身ID）
                        pagenum: pagenum,
                        pagesize: pagesize
                    },
                    success: function(response) {
                        $(".chat-num-messages").empty().append("already have " + response.totalnum + " messages");
                        if (pagenum * pagesize < response.totalnum) {
                            var templateMore = Handlebars.compile($("#message-more-template").html());
                            $(".page-chat-history").append(templateMore());
                            //show all the messages
                            $(document).on('click', '.page-more-message-btn', function() {
                                $.ajax({
                                    url: '/get_all_messages.json',
                                    type: 'get',
                                    dataType: 'json',
                                    data: {
                                        conversationId: conversationId, //会话id
                                        fid: fid, //发出请求的ID（自身ID）
                                    },
                                    success: function(response) {
                                        $(".page-chat-history").empty();
                                        var message_count = response.history.length;
                                        if (message_count > 0) {

                                            for (var x = message_count - 1; x >= 0; x--) {
                                                var history_item = JSON.parse(response.history[x]);

                                                if (history_item.fid != fid) {
                                                    var template = Handlebars.compile($("#message-template").html());
                                                    var context = {
                                                        messageOutput: history_item.msg,
                                                        time: new Date(history_item.t).toLocaleString(),
                                                        tname: history_item.tname,
                                                    };

                                                    $(".page-chat-history").append(template(context));

                                                } else {
                                                    var templateResponse = Handlebars.compile($("#message-response-template").html());
                                                    var contextResponse = {
                                                        response: history_item.msg,
                                                        time: new Date(history_item.t).toLocaleString()
                                                    };

                                                    $(".page-chat-history").append(templateResponse(contextResponse));

                                                }
                                            }
                                        }
                                        chat.scrollToTop();
                                    }
                                })

                            });
                        }

                        var message_count = response.history.length;
                        if (message_count > 0) {
                            for (var x = message_count - 1; x >= 0; x--) {
                                var history_item = JSON.parse(response.history[x]);

                                console.log(history_item);

                                if (history_item.fid != fid) {
                                    var template = Handlebars.compile($("#message-template").html());
                                    var context = {
                                        messageOutput: history_item.msg,
                                        time: new Date(history_item.t).toLocaleString(),
                                        tname: history_item.fname,
                                    };

                                    $(".page-chat-history").append(template(context));

                                } else {
                                    var templateResponse = Handlebars.compile($("#message-response-template").html());
                                    var contextResponse = {
                                        response: history_item.msg,
                                        time: new Date(history_item.t).toLocaleString()
                                    };

                                    $(".page-chat-history").append(templateResponse(contextResponse));

                                }
                            }
                        }
                        chat.scrollToBottom();
                    }

                });
            });
        },

        getConversations: function() {
            $.ajax({
                url: 'get_all_conversations.json',
                type: 'get',
                dataType: 'json',
                data: {
                    fid: fid
                },
                success: function(response) {
                    console.log(response);
                    var people_count = response.tids.length;
                    var html = '';
                    for (var x = 0; x < people_count; x++) {
                        html += ("<li class=\'clearfix\'>");
                        html += ("          <img src=\'" + "http://dev.talkeer.com:8080/"+response.tavatars[x] + "\' alt=\'avatar\'  class=\'img-rounded\'/>");
                        html += ("          <div class=\'about\'>");
                        html += ("            <div class=\'nickname\'>") + response.tnames[x] + "</div>";
                        html += ("            <div class=\'id\' style=\"display:none\">") + response.tids[x] + "</div>";
                        html += ("            <div class=\'status\'>");
                        html += ("              <i class=\'fa fa-circle online\'></i> online");
                        html += ("            </div>");
                        html += ("          </div>");
                        if(response.unread[x] > 0){
                            html += ("<span class=\"badge\">"+ response.unread[x]+ "</span> </li>");
                        }else{
                            html += (" </li>");       
                        }
                    }

                    $(".people-list .list").empty().append(html);

                    searchFilter.init();
                    chat.bindChat();
                }

            })
        },

        getContact: function() {
            $.get('/get_all_chatters.json', function(response) {
                console.log(response);

                var people_count = response.length;
                var html = '';
                for (var x = 0; x < people_count; x++) {
                    html += ("<li class=\'clearfix\'>");
                    html += ("          <img src=\'" + "http://dev.talkeer.com:8080/"+response[x].avatar + "\' alt=\'avatar\' class=\'img-rounded\' />");
                    html += ("          <div class=\'about\'>");
                    html += ("            <div class=\'nickname\'>") + response[x].nickname + "</div>";
                    html += ("            <div class=\'id\' style=\"display:none\">") + response[x]._id + "</div>";
                    html += ("            <div class=\'status\'>");
                    html += ("              <i class=\'fa fa-circle online\'></i> online");
                    html += ("            </div>");
                    html += ("          </div>");
                    html += ("        </li>");
                }

                $(".people-list .list").empty().append(html);

                searchFilter.init();

                chat.bindChat();

            });

        }

    };

    chat.init();

    //发送登录消息
    socket.emit('join', { uid: fid });

    //收到新消息通知
    socket.on('message-count', function(data) {
        console.log(data);
        toastr.info('你有新消息了！');
        $('#chatAudio')[0].play();
    });

})