var sys = require('sys'),
    app = require('http').createServer(),
    sio = require('socket.io'),
    fs = require('fs'),
    json = JSON.stringify;

var sids = new Array();
var users = new Array();
var kicked = new Array();
var colors = ['#05FDFD', '#FA7005']
var accepted_actions = ['move', 'speak', 'conn', 'info', 'thekick', 'theban'];
var currentTime;
var WORLD_W = 1500,
    WORLD_Y = 1500;

app.listen(8080);
var io = sio.listen(app);

io.sockets.on('connection', function(socket){
    socket.ip = socket.handshake.address.address;
    socket.on('message', function(message){
        if (kicked.indexOf(socket.ip) != -1) {
            socket._onDisconnect();
            return false;
        }

        try {
            request = JSON.parse(message.replace('<', '&lt;').replace('>', '&gt;'));
        } catch (SyntaxError) {
            console.log('Invalid JSON:');
            console.log(message);
            return false;
        }

        request.id = socket.id;

        if(accepted_actions.indexOf(request.action) == -1) {
            console.log('Invalid request:' + "\n" + message);
            return false;
        }

        if(request.action == 'conn') {
            request.name = request.name.substring(0,15);
            for(i in sids){
                var s = sids[i];
                socket.send(json({
                    action:'conn',
                    id: s,
                    name:users[s].name,
                    color:users[s].color,
                    x: users[s].x,
                    y: users[s].y
                }));
            }
            request.color = colors[Math.round(Math.random())];

            socket.send(json({
                    action:'me',
                    id: socket.id,
                    name: request.name,
                    color: request.color
            }));

            var access = fs.createWriteStream('/home/azlyth/thegrid/access.log', {flags:'a'});
            currentTime = new Date();
            access.write("[" + currentTime.toUTCString() + "] " + request.name + " (SID: " + socket.id + " IP: " + socket.ip +") connected.\n");

            sids.push(socket.id);
            users[socket.id] = {name:request.name, color:request.color, ip:socket.ip, x:request.x, y:request.y};
        } else if (sids.indexOf(socket.id) == -1) {
            return false;
        }

        if(request.action == 'move') {
            if ( request.x < 0 || request.x > WORLD_W || request.y < 0 || request.y > WORLD_Y) return false;
            if(users[socket.id])
            {
                users[socket.id].x = request.x;
                users[socket.id].y = request.y;
            }
        }

        if(request.action == 'speak') {
            var chatlog = fs.createWriteStream('/home/azlyth/thegrid/chat.log', {flags:'a'});
            currentTime = new Date();
            chatlog.write("[" + currentTime.toUTCString() + "] " + users[socket.id].name + ": " + request.chat +"\n");
            request.chat = request.chat.substring(0,140);
            io.sockets.send(json(request));
            return true;
        }


        if(request.action == 'info') {
            console.log("\nINFO\n");
            console.log("Total clients: " + sids.length);
            console.log("Kicked: " + kicked);
            console.log("");
            for (i in sids){
                s = sids[i];
                console.log("sid: " + s);
                console.log("ip: " + users[s].ip);
                console.log("name: " + users[s].name);
                console.log("color: " + users[s].color);
                console.log("pos: " + users[s].x + ", " + users[s].y);
                console.log("");
            }
        }

        if(request.action == 'thekick' || request.action == 'theban') {
            kicked.push(request.ip);
            console.log(request.action + ": " + request.ip);
            if (request.action == 'thekick') {
                var ip = request.ip;
                var duration = parseInt(request.duration);
                var unkick = function(){
                        return (function(){
                            delete kicked[kicked.indexOf(ip)];
                            console.log(kicked);
                            console.log("unkicked: " + ip);
                            console.log("time served: " + duration+"ms");
                        });
                };
                setTimeout(unkick(), duration);
            }
            return false;
        }
    
        socket.broadcast.send(json(request));
    });

    socket.on('disconnect', function(){
        io.sockets.send(json({'id': socket.id, 'action': 'close'}));

        if (sids.indexOf(socket.id) != -1) {
            currentTime = new Date();
            var access = fs.createWriteStream('/home/azlyth/thegrid/access.log', {flags:'a'});
            access.write("[" + currentTime.toUTCString() + "] " + users[socket.id].name + " (SID: " + socket.id + " IP: " + socket.ip +") disconnected.\n");
            sids.splice(sids.indexOf(socket.id),1);
            delete users[socket.id];
        } else {
            console.log("on dc, cannot find: " + socket.id);
        }
    });
});
