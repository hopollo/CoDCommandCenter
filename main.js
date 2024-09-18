const connection = new RTCMultiConnection();

connection.iceServers = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun.l.google.com:19302?transport=udp",
    ],
  },
];

connection.enableScalableBroadcast = true;

// each relaying-user should serve only 1 users
connection.maxRelayLimitPerUser = 1;

connection.autoCloseEntireSession = true;

connection.socketURL = "https://muazkhan.com:9001/";

//do i need this ?
connection.socketMessageEvent = "scalable-media-broadcast-demo";

document.getElementById("broadcast-id").innerText = connection.userid;

connection.connectSocket((socket) => {
  socket.on("logs", (log) => {
    /*
    document.querySelector("h1").innerHTML = log
      .replace(/</g, "----")
      .replace(/>/g, "___")
      .replace(/----/g, '(<span style="color:red;">')
      .replace(/___/g, "</span>)");
      */
  });

  // this event is emitted when a broadcast is already created.
  socket.on("join-broadcaster", (hintsToJoinBroadcast) => {
    console.log("join-broadcaster", hintsToJoinBroadcast);

    connection.session = hintsToJoinBroadcast.typeOfStreams;
    connection.sdpConstraints.mandatory = {
      OfferToReceiveVideo: !!connection.session.video,
      OfferToReceiveAudio: !!connection.session.audio,
    };
    connection.broadcastId = hintsToJoinBroadcast.broadcastId;
    connection.join(hintsToJoinBroadcast.userid);
  });

  socket.on("rejoin-broadcast", (broadcastId) => {
    console.log("rejoin-broadcast", broadcastId);

    connection.attachStreams = [];

    socket.emit(
      "check-broadcast-presence",
      broadcastId,
      function (isBroadcastExists) {
        if (!isBroadcastExists) {
          // the first person (i.e. real-broadcaster) MUST set his user-id
          connection.userid = broadcastId;
        }

        socket.emit("join-broadcast", {
          broadcastId: broadcastId,
          userid: connection.userid,
          typeOfStreams: connection.session,
        });
      }
    );
  });

  socket.on("broadcast-stopped", (broadcastId) => {
    console.error("broadcast-stopped", broadcastId);
    alert("This broadcast has been stopped.");
    location.reload();
  });

  // this event is emitted when a broadcast is absent.
  socket.on("start-broadcasting", (typeOfStreams) => {
    // host i.e. sender should always use this!
    connection.sdpConstraints.mandatory = {
      OfferToReceiveVideo: false,
      OfferToReceiveAudio: false,
    };

    connection.session = typeOfStreams;

    // "open" method here will capture media-stream
    // we can skip this function always; it is totally optional here.
    // we can use "connection.getUserMediaHandler" instead
    connection.open(connection.userid);
  });
});

window.onbeforeunload = function () {
  // Firefox is ugly.
  document.getElementById("open-or-join").disabled = false;
};

const audioContainer = document.getElementById("audio-container");

connection.onstream = (e) => {
  if (connection.isInitiator && e.type !== "local") {
    return;
  }

  // What's that ??
  connection.isUpperUserLeft = false;

  const audioEl = document.createElement('audio');
  audioEl.srcObject = e.stream;
  audioEl.play();
  audioEl.id = e.userid;
  audioEl.controls = true;
  audioContainer.appendChild(audioEl);

  if (e.type === "local") audioEl.muted = true;

  if (connection.isInitiator == false && e.type === "remote") {
    // he is merely relaying the media
    connection.dontCaptureUserMedia = true;
    connection.attachStreams = [e.stream];
    connection.sdpConstraints.mandatory = {
      OfferToReceiveAudio: false,
      OfferToReceiveVideo: false,
    };

    connection.getSocket((socket) => {
      socket.emit("can-relay-broadcast");

      if (connection.DetectRTC.browser.name === "Chrome") {
        connection.getAllParticipants().forEach((p) => {
          if (p + "" != e.userid + "") {
            let peer = connection.peers[p].peer;
            peer.getLocalStreams().forEach((localStream) => {
              peer.removeStream(localStream);
            });
            e.stream.getTracks().forEach((track) => {
              peer.addTrack(track, e.stream);
            });
            connection.dontAttachStream = true;
            connection.renegotiate(p);
            connection.dontAttachStream = false;
          }
        });
      }

      if (connection.DetectRTC.browser.name === "Firefox") {
        // Firefox is NOT supporting removeStream method
        // that's why using alternative hack.
        // NOTE: Firefox seems unable to replace-tracks of the remote-media-stream
        // need to ask all deeper nodes to rejoin
        connection.getAllParticipants().forEach(function (p) {
          if (p + "" != e.userid + "") {
            connection.replaceTrack(e.stream, p);
          }
        });
      }

      // Firefox seems UN_ABLE to record remote MediaStream
      // WebAudio solution merely records audio
      // so recording is skipped for Firefox.
      if (connection.DetectRTC.browser.name === "Chrome") {
        repeatedlyRecordStream(e.stream);
      }
    });
  }

  // to keep room-id in cache
  localStorage.setItem(connection.socketMessageEvent, connection.sessionid);
};

// ask node.js server to look for a broadcast
// if broadcast is available, simply join it. i.e. "join-broadcaster" event should be emitted.
// if broadcast is absent, simply create it. i.e. "start-broadcasting" event should be fired.
//document.getElementById("broadcast-id").focus();
document.getElementById("open-or-join").onclick = () => {
  const broadcastId = document.getElementById("broadcast-id").value;
  if (broadcastId.replace(/^\s+|\s+$/g, "").length <= 0) return alert("Please enter broadcast-id");

  document.getElementById("open-or-join").disabled = true;

  document.getElementById("members-counter").innerHTML = "Connecting to the channel..."

  connection.extra.broadcastId = broadcastId;

  connection.session = {
    audio: true,
    video: false,
    data: true,
    oneway: true,
  }

  connection.getSocket((socket) => {
    socket.emit(
      "check-broadcast-presence",
      broadcastId,
      (isBroadcastExists) => {
        if (!isBroadcastExists) {
          // the first person (i.e. real-broadcaster) MUST set his user-id
          connection.userid = broadcastId;
        }

        console.log("check-broadcast-presence", broadcastId, isBroadcastExists);

        socket.emit("join-broadcast", {
          broadcastId: broadcastId,
          userid: connection.userid,
          typeOfStreams: connection.session,
        });
      }
    );
  });
};

connection.onMediaError = (error, constraints) => {
  alert('Please enable Mic access to use this website')
}

// we don't need to display message when we reload the page
// connection.onstreamended = () => {};

connection.onleave = (event) => {
  if (event.userid !== audioContainer.userid) return;

  connection.getSocket(function (socket) {
    socket.emit("can-not-relay-broadcast");

    connection.isUpperUserLeft = true;

    /*
    if (allRecordedBlobs.length) {
      // playing lats recorded blob
      var lastBlob = allRecordedBlobs[allRecordedBlobs.length - 1];
      audioPreview.src = URL.createObjectURL(lastBlob);
      audioPreview.play();
      allRecordedBlobs = [];
    } else if (connection.currentRecorder) {
      var recorder = connection.currentRecorder;
      connection.currentRecorder = null;
      recorder.stopRecording(() => {
        if (!connection.isUpperUserLeft) return;

        audioPreview.src = URL.createObjectURL(recorder.getBlob());
        audioPreview.play();
      });
    }

    if (connection.currentRecorder) {
      connection.currentRecorder.stopRecording();
      connection.currentRecorder = null;
    }
    */
  });
};

// ......................................................
// ......................Handling broadcast-id...........
// ......................................................
let broadcastId = "";
if (localStorage.getItem(connection.socketMessageEvent)) {
  broadcastId = localStorage.getItem(connection.socketMessageEvent);
} else {
  broadcastId = connection.token();
}
const txtBroadcastId = document.getElementById("broadcast-id");
txtBroadcastId.value = broadcastId;
txtBroadcastId.onkeyup =
  txtBroadcastId.oninput =
  txtBroadcastId.onpaste =
  () => {
    localStorage.setItem(connection.socketMessageEvent, this.value);
  };

connection.onNumberOfBroadcastViewersUpdated = (event) => {
  document.getElementById("members-counter").innerHTML = `Currently live with <span class="text-red-700 font-semibold px-2">${event.numberOfBroadcastViewers}</span> players.`;
};

// ......................................................
// ......................Handling messaging..............
// ......................................................
let numberOfKeys = 0;
let lastMessageUUID;

document.getElementById("message-input").onkeyup = (e) => {
  numberOfKeys++;

  if (numberOfKeys > 3) numberOfKeys = 0;

  if (!numberOfKeys) {
    if (!lastMessageUUID) {
      lastMessageUUID = Math.round(Math.random() * 999999999) + 9995000;
    }

    connection.send({
      typing: true,
      lastMessageUUID: lastMessageUUID,
    });
  }

  if (!this.value.length) {
    return connection.send({
      stoppedTyping: true,
      lastMessageUUID: lastMessageUUID,
    });
  }

  // removing trailing/leading whitespace
  /*
  this.value = this.value.replace(/^\s+|\s+$/g, "");
  */

  if (e.key == "Enter") {
    connection.send({
      message: document.getElementById("message-input").value,
      lastMessageUUID: lastMessageUUID,
    });

    appendDIV(
      document.getElementById("message-input").value,
      lastMessageUUID,
      true
    );

    lastMessageUUID = null;

    document.getElementById("message-input").value = "";
  }
};

document.getElementById("send-message-button").onclick = () => {
  connection.send({
    message: document.getElementById("message-input").value,
    lastMessageUUID: lastMessageUUID,
  });

  appendDIV(
    document.getElementById("message-input").value,
    lastMessageUUID,
    true
  );

  lastMessageUUID = null;

  document.getElementById("message-input").value = "";
};

connection.onmessage = (event) => {
  const div = document.getElementById(event.data.lastMessageUUID);

  if (event.data.typing === true) {
    return appendDIV(event.userid + " is typing..", event.data.lastMessageUUID);
  }

  if (event.data.stoppedTyping === true) {
    if (div) return div.parentNode.removeChild(div);
  }

  if (event.data.modified === true) {
    if (div) return (div.innerHTML = event.data.message);
  }

  if (event.data.removed === true) {
    if (!div) return div.parentNode.removeChild(div);
  }

  appendDIV(
    event.userid + " : " + event.data.message,
    event.data.lastMessageUUID
  );
};

const chatContainer = document.getElementById("messages-container");

function appendDIV(message, messageUUID) {
  let existing = false;
  let div;

  if (document.getElementById(messageUUID)) {
    div = document.getElementById(messageUUID);
    existing = true;
  } else {
    div = document.createElement("div");
    div.class = "bg-blue-500 rounded border p-2 text-white font-semibold";
    if (messageUUID) div.id = messageUUID;
  }

  div.innerText = message;

  if (!existing) {
    chatContainer.insertBefore(div, chatContainer.firstChild);
  }

  document.getElementById("message-input").focus();
}

function modify(lastMessageUUID, modifiedValue) {
  connection.send({
    message: modifiedValue,
    lastMessageUUID: lastMessageUUID,
    modified: true,
  });
}

function remove(lastMessageUUID) {
  connection.send({
    lastMessageUUID: lastMessageUUID,
    removed: true,
  });
}
