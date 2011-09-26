var socket;

var filterStrength = 20,
    frameTime = 0, 
    lastLoop = new Date, thisLoop = 0;

var general = {
    DEBUG: false,
    HOST_URI: 'http://www.someindividual.com:8080',
    CONN_OPTIONS: {'transports':['websocket']},
    FRAME_INTERVAL: 16,
    WORLD_H: 1500,
    WORLD_W: 1500,
    CHAT_DURATION: 8000,
    CHAT_WIDTH: 250,
    USER_RADIUS: 5,
    retrying: false,
};

var control = {
    rightDown: false,
    leftDown: false,
    upDown: false,
    downDown: false,
    typing: false
};

var canvas = {
    obj: undefined,
    width: 640,
    height: 480,
    offset_x:0,
    offset_y:0
};

var physics = {
    objects: new Array(),
    accel: 50 * (general.FRAME_INTERVAL/1000),
    fric: 30 * (general.FRAME_INTERVAL/1000),
    restitution: 0.6,
    xvel: 0,
    yvel: 0
};

var me = {};
var ids = new Array();
var users = new Array();
var context;
var img = new Image();

function onResize() {
    canvas.width = canvas.obj.width = window.innerWidth;
    canvas.height = canvas.obj.height = window.innerHeight;
    me.x = canvas.width/2;
    me.y = canvas.height/2;

    msgbox = $(".message");
    msgbox.css("left", (canvas.width - msgbox.width())/2 + "px");
    $("#prompt").css("left", (canvas.width - $("#prompt").width())/2 + "px");
    if (canvas.width <= 750) {
        $("#chatarea").width(.8 * canvas.width).css("margin-left", -0.4*canvas.width);
        $("#chatlog").width(.8 * canvas.width);
        $("#chatinput").width(.8 * canvas.width);
    }
}

function centerCamera() {
    var halfw = canvas.width/2,
        halfh = canvas.height/2;

    canvas.offset_x = me.world_x - halfw;
    canvas.offset_y = me.world_y - halfh;
}

$(window).resize(onResize);

function onKeyDown(evt) {
    if (!control.typing) {
        if (evt.which == 39 || evt.which == 68) control.rightDown = true;
        if (evt.which == 37 || evt.which == 65) control.leftDown = true;
        if (evt.which == 38 || evt.which == 87) control.upDown = true;
        if (evt.which == 40 || evt.which == 83) control.downDown = true;
    }
}

function onKeyUp(evt) {
    if (!control.typing) {
        if (evt.which == 39 || evt.which == 68) control.rightDown = false;;
        if (evt.which == 37 || evt.which == 65) control.leftDown = false;;
        if (evt.which == 38 || evt.which == 87) control.upDown = false;;
        if (evt.which == 40 || evt.which == 83) control.downDown = false;;
    }
}

function onKeyPress(evt) {
    if (control.typing) {
        if (evt.which == 13) sendchat();
    } else {
        if (evt.which ==13) {
            $(document).one("keyup", function(evt){
                if (evt.which == 13)
                    showchat();
            });
        }
        if (evt.which == 108) togglelog();
    }
}

function displayMessage(evt, msg) {
    msgbox = $('.message');
    msgbox[0].innerHTML = msg;
    msgbox.delay(500).show("fold",500).delay(5000).hide("fold",500);
}

function friction()
{
    var xvel = physics.xvel,
        yvel = physics.yvel,
        fric = physics.fric;
    var dx = 0, dy = 0, angle = 0;

    if (xvel != 0 && yvel != 0)
    {
        angle = Math.atan(Math.abs(yvel/xvel));
        dx = fric*Math.cos(angle);
        dy = fric*Math.sin(angle);
    }
    else if (xvel != 0)
    {
        dx = fric;
        dy = 0;
    }
    else if (yvel != 0)
    {
        dx = 0;
        dy = fric;
    }
    if (general.DEBUG)
    {
        $("#Afx")[0].innerHTML = "A_fx: " + dx;
        $("#Afy")[0].innerHTML = "A_fy: " + dy;
    }

    if (dx > Math.abs(xvel)) dx = Math.abs(xvel);
    if (dy > Math.abs(yvel)) dy = Math.abs(yvel);
    
    if (xvel > 0) xvel -= dx;
    else xvel += dx;
    if (yvel > 0) yvel -= dy;
    else yvel += dy;

    physics.xvel = xvel;
    physics.yvel = yvel;
}

function move()
{
    if ( (control.rightDown ? !control.leftDown : control.leftDown) && (control.upDown ? !control.downDown : control.downDown)) {
        var diagaccel = physics.accel * (1 / Math.sqrt(2));
        if (control.rightDown) physics.xvel += diagaccel;
        if (control.leftDown) physics.xvel -= diagaccel;
        if (control.upDown) physics.yvel -= diagaccel;
        if (control.downDown) physics.yvel += diagaccel;
    }
    else {
        if (control.rightDown) physics.xvel += physics.accel;
        if (control.leftDown) physics.xvel -= physics.accel;
        if (control.upDown) physics.yvel -= physics.accel;
        if (control.downDown) physics.yvel += physics.accel;
    }

    friction();

    colDetect();

    //send the data
    socket.send(JSON.stringify({
        action:'move',
        x:me.world_x,
        y:me.world_y
    }));
}

function othermove(data) {
    if (ids.indexOf(data.id) != -1) {
       users[data.id].world_x = data.x;
       users[data.id].world_y = data.y;
    } else {
        ids.push(data.id);
        users[data.id] = {
            world_x: data.x,
            world_y: data.y,
            name: ''
        };
        updateStatus();
    }
}

function otherremove(data)
{
    if (users[data.id].chattid)
        clearTimeout(users[data.id].chattid);
    delete users[data.id];
    var index = ids.indexOf(data.id);
    if (index != -1)
        ids.splice(ids.indexOf(data.id),1);
    updateStatus();
}

function otherdraw()
{
    for (var i in ids)
    {
        var user = users[ids[i]];

        context.fillStyle = user.color;
        context.strokeStyle = user.color;

        ux = user.x = user.world_x - canvas.offset_x;
        uy = user.y = user.world_y - canvas.offset_y;

        context.beginPath();
        context.arc(ux, uy, general.USER_RADIUS, 0, Math.PI*2, true);
        context.closePath();
        context.fill();

        context.font = "12px sans-serif"; 
        context.textAlign = "center";
        context.fillText(user.name, ux, uy+18);

        if (user.chat) displaychat(user);
    }
}

function otherconn(data) {
    var username = data.name.replace("&lt;", "<").replace("&gt;",">");
    var sid = data.id;
    if (ids.indexOf(sid) != -1) {
        users[sid].name = username;
        users[sid].world_x = data.x;
        users[sid].world_y = data.y;
        users[sid].color = data.color;
    } else {
        ids.push(sid);
        users[sid] = {
            name: username,
            world_x: data.x,
            world_y: data.y,
            color: data.color
        };
        updateStatus();
    }
}

function draw()
{
    context.lineWidth = 4;

    context.clearRect(0,0,canvas.width,canvas.height);

    // calculate position
    centerCamera();
    move();

    var start_x = canvas.offset_x > 0 ? 0 : -1 * canvas.offset_x,
        start_y = canvas.offset_y > 0 ? 0 : -1 * canvas.offset_y,
        end_x = canvas.offset_x + canvas.width > img.width ? canvas.width - (canvas.offset_x + canvas.width - general.WORLD_W) : canvas.width,
        end_y = canvas.offset_y + canvas.height > img.height ? canvas.height - (canvas.offset_y + canvas.height - general.WORLD_H) : canvas.height;

    //context.drawImage(img,-1*canvas.offset_x, -1*canvas.offset_y);

    context.strokeStyle = "#03F2D2";
    context.beginPath();
    var linepos;
    if(canvas.offset_x < 0) {
        context.moveTo(start_x,start_y);
        context.lineTo(start_x,end_y);
    } 
    if (canvas.offset_x + canvas.width > general.WORLD_W) {
        linepos = canvas.width - (canvas.offset_x + canvas.width - general.WORLD_W);
        context.moveTo(end_x,start_y);
        context.lineTo(end_x,end_y);
    }
    if(canvas.offset_y < 0) {
        context.moveTo(start_x,start_y);
        context.lineTo(end_x,start_y);
    } 
    if (canvas.offset_y + canvas.height > general.WORLD_H) {
        linepos = canvas.height - (canvas.offset_y + canvas.height - general.WORLD_H);
        context.moveTo(start_x,end_y);
        context.lineTo(end_x,end_y);
    }
    context.stroke();

    drawObjects();
        
    otherdraw();

    // draw user
    context.fillStyle = me.color;
    context.beginPath();
    context.arc(canvas.width/2, canvas.height/2, general.USER_RADIUS, 0, Math.PI*2, true);
    context.closePath();
    context.fill();

    context.font = "12px sans-serif"; 
    context.textAlign = "center";
    context.fillText(me.name, canvas.width/2, canvas.height/2+18);
    if (me.chat) displaychat(me);


    if(general.DEBUG) {
        var thisFrameTime = (thisLoop=new Date) - lastLoop;
        frameTime+= (thisFrameTime - frameTime) / filterStrength;
        lastLoop = thisLoop;
    }
}

function drawObjects() {
    var objects = physics.objects;
    var coords;
    for (i in objects) {
        context.strokeStyle = "#03F2D2";
        coords = objects[i].coords;

        context.beginPath();
        context.moveTo(coords[0][0]-canvas.offset_x,coords[0][1]-canvas.offset_y);
        for(var j=1; j<coords.length;j++) {
            context.lineTo(coords[j][0]-canvas.offset_x,coords[j][1]-canvas.offset_y);
        }
        context.stroke();
    }
}

function dotProduct(a, b)
{
    return a[0]*b[0] + a[1]*b[1];
}

// Ignore ridiculous vector math, not used yet.
function colDetect() {
    var objects = physics.objects;
    var coords;
    var p1, p2, p3, p4, ua, ub, numera, numerb, denom;
    p1 = [me.world_x, me.world_y];
    p2 = [me.world_x+physics.xvel, me.world_y+physics.yvel];

    for (i in objects) {
        coords = objects[i].coords;
        p3 = coords[0];
        for (var j=1; j<coords.length; j++) {
            p4 = coords[j];
            denom = (p4[1]-p3[1])*(p2[0]-p1[0]) - (p4[0]-p3[0])*(p2[1]-p1[1]);
            if (denom == 0) {
                p3 = p4;
                continue;
            }
            ua = ((p4[0]-p3[0])*(p1[1]-p3[1]) - (p4[1]-p3[1])*(p1[0]-p3[0])) / denom;
            ub = ((p2[0]-p1[0])*(p1[1]-p3[1]) - (p2[1]-p1[1])*(p1[0]-p3[0])) / denom;
            if (0 < ua && ua < 1 && 0 < ub && ub < 1) {
                var interpt = [p1[0] + ua*(p2[0]-p1[0]), p1[1] + ua*(p2[1]-p1[1])];
                var v = [physics.xvel, physics.yvel];
                var norm = [p4[1]-p3[1],-(p4[0]-p3[0])];
                var length = Math.sqrt(Math.pow(p4[0]-p3[0],2) + Math.pow(p4[1]-p3[1],2));
                norm = [norm[0]/length, norm[1]/length];
                var dp = dotProduct(v,norm);
                var u = [norm[0] * dp, norm[1] * dp],
                    w = [v[0]-u[0], v[1]-u[1]];
                var v_p = [w[0]-u[0]*physics.restitution, w[1]-u[1]*physics.restitution];
                me.world_x = interpt[0]+v_p[0];
                me.world_y = interpt[1]+v_p[1];
                physics.xvel = v_p[0];
                physics.yvel = v_p[1];
            }
            p3 = p4;
        }
    }

    me.world_x += physics.xvel;
    if (me.world_x - general.USER_RADIUS< 0) { me.world_x = 0 + general.USER_RADIUS; physics.xvel *= -physics.restitution; }
    else if (me.world_x + general.USER_RADIUS > general.WORLD_W) { me.world_x = general.WORLD_W - general.USER_RADIUS; physics.xvel *= -physics.restitution;} 
    
    me.world_y += physics.yvel;
    if (me.world_y - general.USER_RADIUS < 0) { me.world_y = 0 + general.USER_RADIUS; physics.yvel *= -physics.restitution; }
    else if (me.world_y + general.USER_RADIUS > general.WORLD_H) { me.world_y = general.WORLD_H - general.USER_RADIUS; physics.yvel *= -physics.restitution;} 
}

function updateStatus(){
    $('#numusers')[0].innerHTML = 'Users online: ' + (ids.length + 1);
}

function input(promptstring, func)
{
    $("body").append("<div id='prompt' style='top:40px;'>" + promptstring +" <br/><input type='text' name='input' maxlength='15'/><br/><p></p></div>");
    $("#prompt").css("left", (canvas.width - $("#prompt").width())/2 + "px");

    $("[name='input']").focus().keypress(function(evt){
        if (evt.which == 13) {
            var entered = $("[name='input']")[0].value;
            while(entered[entered.length-1] === " " || entered[entered.length-1] === "\n")
                entered = entered.substring(0,entered.length-1);
            if (entered)
                setTimeout(function(){func(entered); $("#prompt").remove();},0);
            else $("#prompt p")[0].innerHTML = "Invalid username."
        }
    });
}

function onconnect(name) {
    updateStatus();
    socket.send(JSON.stringify({
        action:'conn',
        name:name,
        x: me.world_x,
        y: me.world_y
    }));
}

function onspeak(data) {
    var chat = data.chat.replace("&lt;", "<").replace("&gt;",">");
    if(data.id == me.id) {
        clearTimeout(me.chattid);
        me.chat = chat;
        $('#chatlog')[0].value += "\n" + me.name + ": " + chat;
        if(!$('#chatlog:focus')[0])
            $("#chatlog")[0].scrollTop = $("#chatlog")[0].scrollHeight;
        me.chattid = setTimeout(function(){me.chat = '';}, general.CHAT_DURATION);
    } else if (users[data.id]) {
        clearTimeout(users[data.id].chattid);
        users[data.id]['chat'] = chat;
        $('#chatlog')[0].value += "\n" + users[data.id]['name'] + ": " + chat;
        if(!$('#chatlog:focus')[0])
            $("#chatlog")[0].scrollTop = $("#chatlog")[0].scrollHeight;
        users[data.id].chattid = setTimeout(function(){users[data.id]['chat'] = '';}, general.CHAT_DURATION);
    }
}

function displaychat(speaker) {
    var wa=speaker.chat.replace("&lt;", "<").replace("&gt;",">").split(" "),
        phraseArray=[],
        lastPhrase="",
        measure=0,
        maxlength = 150;
    
    for (var i=0;i<wa.length;i++) {
        var w=wa[i];
        measure=context.measureText(lastPhrase+w).width;
        if (measure<general.CHAT_WIDTH) {
            lastPhrase+=(w+" ");
        }else {
            if(context.measureText(w).width > general.CHAT_WIDTH) {
                var wlen = context.measureText(w).width;
                var space = general.CHAT_WIDTH - context.measureText(lastPhrase + " ").width;
                var index = Math.floor(space/Math.ceil(wlen/w.length));
                phraseArray.push(w.substring(0,index));
                wa.splice(i+1,0,w.substring(index,w.length));
            } else {
                if (lastPhrase[lastPhrase.length-1] == " ")
                    lastPhrase = lastPhrase.substring(0,lastPhrase.length-1);
                phraseArray.push(lastPhrase);
                lastPhrase=w+" ";
            }
        }
        if (i===wa.length-1) {
            if (lastPhrase[lastPhrase.length-1] == " ")
                lastPhrase = lastPhrase.substring(0,lastPhrase.length-1);
            phraseArray.push(lastPhrase);
            break;
        }
    }

    context.font = "15px sans-serif"; 
    context.textAlign = "center";
    while(phraseArray.length > 0) {
        lastPhrase = phraseArray.splice(0,1);
        context.fillText(lastPhrase, speaker.x, speaker.y-15-(phraseArray.length*15));
    }
}

function togglelog() {
    if ($("#chatlog").css("visibility") === "visible")
        $("#chatlog").css("visibility", "hidden");
    else
        $("#chatlog").css("visibility", "visible");
}

function showchat() {
    control.typing = true;
    $("#chatinput").css("visibility","visible").focus();
    onResize();
}

function sendchat() {
    control.typing = false;

    var entered = $("#chatinput")[0].value;
    while(entered[entered.length-1] === " " || entered[entered.length-1] === "\n")
        entered = entered.substring(0,entered.length-1);
    if (!(entered === "")) {
        socket.send(JSON.stringify({
            action:'speak',
            chat: entered
        }));
    }
    $("#chatinput").css("visibility", "hidden").blur();
    $("#chatinput")[0].value = '';
}


function init(name) {
    socket = io.connect(general.HOST_URI, general.CONN_OPTIONS);
    me.name = "";
    me.color = "#555555";
    me.x = canvas.width/2;
    me.y = canvas.height/2;
    me.world_x = 300;
    me.world_y = 300;
    centerCamera();

    if (navigator.userAgent.toLowerCase().indexOf('chrome') > -1  ) {
        $("#numusers")[0].innerHTML = "Connecting to server...";
        $("#numusers").show();
        if (socket) {
            general.retrying = setInterval("io.connect(general.HOST_URI, general.CONN_OPTIONS)",3000);
            socket.on('connect', function(){
                if(general.retrying){
                    clearTimeout(general.retrying);
                    general.retrying = false;
                }
                onconnect(name);
            });
            socket.on('message', function(data){
                data = JSON.parse(data);
                if (data.action == 'move') {
                    othermove(data);
                } else if (data.action == 'speak') {
                    onspeak(data);
                } else if (data.action == 'conn') {
                    otherconn(data);
                } else if (data.action == 'close') {
                    otherremove(data);
                } else if (data.action == 'me') {
                    me.name = data.name.replace("&lt;", "<").replace("&gt;",">");
                    me.id = data.id;
                    me.color = data.color;
                }
            });
            socket.on('disconnect', function(){
                ids = new Array();
                users = new Array();
                me.name = "";
                me.color = "#555555";
                $("#numusers")[0].innerHTML = "Disconnected!<br/>Trying to reconnect...";
                general.retrying = setInterval("io.connect(general.HOST_URI)", 3000);
            });
        }
    }
    if (general.DEBUG) {
        $(".debug").css("display", "inline");
        setInterval(function(){$("#fps")[0].innerHTML = "fps: " + (1000/frameTime).toFixed(1);}, 1000);
    }

    setInterval(draw, general.FRAME_INTERVAL);
    $(document).keydown(onKeyDown);
    $(document).keyup(onKeyUp);
    $(document).keypress(onKeyPress);
    $('#chatinput').focus(function(e){control.typing = true;});
    $('#chatinput').blur(function(e){control.typing = false;});
    $(".message").bind("custom", displayMessage);
    $(".message").trigger("custom", ['Use arrow keys to move.<br/>Press enter to chat.<br/>Press "L" for the chat log.']);
}

$(document).ready(function(){
    canvas.obj = $("#canvas")[0];

    context = canvas.obj.getContext("2d");
    if (navigator.userAgent.toLowerCase().indexOf('chrome') === -1  ) {
        $("body").append("<div class='error'>WARNING: This page was built for Chrome. Therefore, the page may be functional, but you will be unable to connect to the server.<br/>Please download Google Chrome.</div>");
    }
    onResize();
    input("Enter any username:", init);
});
