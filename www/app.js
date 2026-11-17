/* Family Chat - private 2-person chat, files, voice & video calls */
firebase.initializeApp(window.FIREBASE_CONFIG);
var auth = firebase.auth();
var db = firebase.firestore();
var storage = firebase.storage();

var $ = function (id) { return document.getElementById(id); };
var me = null, myName = '', peer = null, chatId = null;
var unsubMsgs = null, unsubUsers = null, unsubIncoming = null;
var pc = null, localStream = null, remoteStream = null, callId = null, unsubCall = [];
var incomingId = null, gotAnswer = false;

function show(id) {
  ['authScreen', 'listScreen', 'chatScreen'].forEach(function (s) {
    $(s).classList.toggle('active', s === id);
  });
}
function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
function fmtTime(ts) {
  var d = new Date(ts || Date.now());
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function toEmail(id) { return id.trim().toLowerCase() + '@familychat.app'; }
function friendlyError(e) {
  var m = {
    'auth/invalid-credential': 'User ID அல்லது Password தவறு',
    'auth/wrong-password': 'Password தவறு',
    'auth/user-not-found': 'இந்த User ID இல்ல',
    'auth/email-already-in-use': 'இந்த User ID ஏற்கனவே இருக்கு, வேற ஒன்னு வைங்க',
    'auth/weak-password': 'Password குறைந்தது 6 எழுத்து வேணும்',
    'auth/network-request-failed': 'Internet இல்ல, சரிபாருங்க',
    'auth/too-many-requests': 'நிறைய முறை தவறு. கொஞ்சம் நேரம் கழிச்சு try பண்ணுங்க',
    'auth/operation-not-allowed': 'Firebase-ல Email/Password sign-in ஆன் பண்ணல'
  };
  return m[e.code] || ('Error: ' + (e.message || e));
}

/* ---------- AUTH ---------- */
$('btnLogin').onclick = function () {
  var id = $('uid').value, pw = $('pw').value;
  $('authErr').textContent = '';
  if (!id.trim() || !pw) { $('authErr').textContent = 'User ID, Password ரெண்டும் போடுங்க'; return; }
  auth.signInWithEmailAndPassword(toEmail(id), pw).catch(function (e) {
    $('authErr').textContent = friendlyError(e);
  });
};
$('btnSignup').onclick = function () {
  var id = $('uid').value.trim().toLowerCase(), pw = $('pw').value;
  var name = $('dname').value.trim() || id;
  $('authErr').textContent = '';
  if (!/^[a-z0-9_]{3,20}$/.test(id)) {
    $('authErr').textContent = 'User ID: 3-20 எழுத்து, a-z, 0-9, _ மட்டும்'; return;
  }
  if (pw.length < 6) { $('authErr').textContent = 'Password குறைந்தது 6 எழுத்து'; return; }
  auth.createUserWithEmailAndPassword(toEmail(id), pw).then(function (cred) {
    return db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, userId: id, name: name, ts: Date.now()
    });
  }).catch(function (e) { $('authErr').textContent = friendlyError(e); });
};
$('btnLogout').onclick = function () { auth.signOut(); };

auth.onAuthStateChanged(function (user) {
  if (user) {
    me = user;
    db.collection('users').doc(user.uid).get().then(function (s) {
      myName = (s.exists && s.data().name) || user.email.split('@')[0];
    }).catch(function () { myName = user.email.split('@')[0]; });
    show('listScreen');
    loadContacts();
    listenIncoming();
  } else {
    me = null; peer = null;
    cleanupAll();
    show('authScreen');
  }
});

function cleanupAll() {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  if (unsubUsers) { unsubUsers(); unsubUsers = null; }
  if (unsubIncoming) { unsubIncoming(); unsubIncoming = null; }
  endCall(false);
  hideIncoming();
}

/* ---------- CONTACTS ---------- */
function loadContacts() {
  if (unsubUsers) unsubUsers();
  unsubUsers = db.collection('users').onSnapshot(function (snap) {
    var box = $('contacts');
    box.innerHTML = '';
    var count = 0;
    snap.forEach(function (doc) {
      var u = doc.data();
      if (!me || u.uid === me.uid) return;
      count++;
      var row = document.createElement('div');
      row.className = 'contact';
      var av = document.createElement('div'); av.className = 'avatar'; av.textContent = initial(u.name);
      var info = document.createElement('div');
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = u.name;
      var sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = '@' + u.userId;
      info.appendChild(nm); info.appendChild(sub);
      row.appendChild(av); row.appendChild(info);
      row.onclick = function () { openChat(u); };
      box.appendChild(row);
    });
    $('noContacts').classList.toggle('hidden', count > 0);
  }, function (e) { $('noContacts').textContent = 'Error: ' + e.message; });
}

/* ---------- CHAT ---------- */
function openChat(u) {
  peer = u;
  chatId = [me.uid, u.uid].sort().join('_');
  $('chatName').textContent = u.name;
  $('chatAvatar').textContent = initial(u.name);
  $('msgs').innerHTML = '';
  show('chatScreen');
  if (unsubMsgs) unsubMsgs();
  unsubMsgs = db.collection('chats').doc(chatId).collection('messages').orderBy('ts')
    .onSnapshot(renderMessages, function (e) { alert('Error: ' + e.message); });
}
$('btnBack').onclick = function () {
  if (unsubMsgs) { unsubMsgs(); unsubMsgs = null; }
  show('listScreen');
};

function renderMessages(snap) {
  var box = $('msgs');
  box.innerHTML = '';
  snap.forEach(function (doc) {
    var m = doc.data();
    var b = document.createElement('div');
    b.className = 'b ' + (m.from === me.uid ? 'me' : 'them');
    if (m.type === 'file') {
      if (m.mime && m.mime.indexOf('image/') === 0) {
        var img = document.createElement('img'); img.src = m.url; img.loading = 'lazy';
        b.appendChild(img);
      }
      var a = document.createElement('a');
      a.className = 'fl'; a.href = m.url; a.target = '_blank'; a.rel = 'noopener';
      var ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = '📄';
      var wrap = document.createElement('span');
      var fn = document.createElement('div'); fn.className = 'fn'; fn.textContent = m.name;
      var fs = document.createElement('div'); fs.className = 'fs'; fs.textContent = fmtSize(m.size);
      wrap.appendChild(fn); wrap.appendChild(fs);
      a.appendChild(ic); a.appendChild(wrap);
      b.appendChild(a);
    } else {
      var t = document.createElement('span'); t.textContent = m.text; b.appendChild(t);
    }
    var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = fmtTime(m.ts);
    b.appendChild(tm);
    box.appendChild(b);
  });
  box.scrollTop = box.scrollHeight;
}

function sendText() {
  var t = $('txt').value.trim();
  if (!t || !chatId) return;
  $('txt').value = '';
  db.collection('chats').doc(chatId).collection('messages').add({
    from: me.uid, type: 'text', text: t, ts: Date.now()
  }).catch(function (e) { alert('Send error: ' + e.message); });
}
$('btnSend').onclick = sendText;
$('txt').addEventListener('keydown', function (e) { if (e.key === 'Enter') sendText(); });

$('btnAttach').onclick = function () { $('file').click(); };
$('file').onchange = function () {
  var f = $('file').files[0];
  $('file').value = '';
  if (!f || !chatId) return;
  var safe = f.name.replace(/[^\w.\-]+/g, '_');
  var ref = storage.ref('chats/' + chatId + '/' + Date.now() + '_' + safe);
  var box = $('upl');
  box.classList.remove('hidden');
  box.textContent = 'Upload: 0%';
  var task = ref.put(f, { contentType: f.type || 'application/octet-stream' });
  task.on('state_changed', function (s) {
    box.textContent = 'Upload: ' + Math.round(100 * s.bytesTransferred / s.totalBytes) + '%';
  }, function (e) {
    box.textContent = 'Upload failed: ' + e.message;
    setTimeout(function () { box.classList.add('hidden'); }, 5000);
  }, function () {
    task.snapshot.ref.getDownloadURL().then(function (url) {
      return db.collection('chats').doc(chatId).collection('messages').add({
        from: me.uid, type: 'file', url: url, name: f.name, size: f.size, mime: f.type || '', ts: Date.now()
      });
    }).then(function () { box.classList.add('hidden'); })
      .catch(function (e) { box.textContent = 'Error: ' + e.message; });
  });
};

/* ---------- CALLS (WebRTC, signaling via Firestore) ---------- */
function setStatus(t) { $('callStatus').textContent = t; }

function getMedia(video) {
  return navigator.mediaDevices.getUserMedia({
    audio: true, video: video ? { facingMode: 'user' } : false
  });
}

function setupPc(video) {
  pc = new RTCPeerConnection({ iceServers: window.ICE_SERVERS });
  remoteStream = new MediaStream();
  $('remoteVideo').srcObject = remoteStream;
  localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });
  pc.ontrack = function (e) {
    e.streams[0].getTracks().forEach(function (t) { remoteStream.addTrack(t); });
  };
  pc.onconnectionstatechange = function () {
    if (!pc) return;
    if (pc.connectionState === 'connected') setStatus('Connected');
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') endCall(true);
  };
  $('localVideo').srcObject = localStream;
  $('localVideo').style.display = video ? 'block' : 'none';
  $('btnCam').style.display = video ? '' : 'none';
  $('btnMute').classList.remove('off'); $('btnCam').classList.remove('off');
}

function showCallUI(name, status) {
  $('callName').textContent = name;
  $('callAvatar').textContent = initial(name);
  setStatus(status);
  $('callScreen').classList.remove('hidden');
}

function watchCall(ref, candidateCollection) {
  unsubCall.push(ref.onSnapshot(function (s) {
    var d = s.data();
    if (!d || !pc) return;
    if (d.answer && !gotAnswer && d.from === me.uid) {
      gotAnswer = true;
      pc.setRemoteDescription(new RTCSessionDescription(d.answer)).catch(function () {});
    }
    if (d.status === 'ended') endCall(false);
  }));
  unsubCall.push(ref.collection(candidateCollection).onSnapshot(function (s) {
    s.docChanges().forEach(function (c) {
      if (c.type === 'added' && pc) {
        pc.addIceCandidate(new RTCIceCandidate(c.doc.data())).catch(function () {});
      }
    });
  }));
}

function startCall(video) {
  if (pc || !peer) return;
  getMedia(video).then(function (stream) {
    localStream = stream;
    setupPc(video);
    gotAnswer = false;
    var ref = db.collection('calls').doc();
    callId = ref.id;
    pc.onicecandidate = function (e) {
      if (e.candidate) ref.collection('callerCandidates').add(e.candidate.toJSON());
    };
    showCallUI(peer.name, 'Calling...');
    return pc.createOffer().then(function (offer) {
      return pc.setLocalDescription(offer).then(function () {
        return ref.set({
          from: me.uid, fromName: myName, to: peer.uid, video: !!video, status: 'ringing',
          ts: Date.now(), offer: { type: offer.type, sdp: offer.sdp }
        });
      });
    }).then(function () { watchCall(ref, 'calleeCandidates'); });
  }).catch(function (e) {
    endCall(false);
    alert('Mic/Camera அனுமதி கொடுங்க (Settings > Apps > Family Chat > Permissions). ' + (e.message || ''));
  });
}
$('btnVoice').onclick = function () { startCall(false); };
$('btnVideo').onclick = function () { startCall(true); };

function listenIncoming() {
  if (unsubIncoming) unsubIncoming();
  unsubIncoming = db.collection('calls').where('to', '==', me.uid).where('status', '==', 'ringing')
    .onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        var d = ch.doc.data();
        if (ch.type === 'added' && !pc && !incomingId && Date.now() - d.ts < 60000) {
          incomingId = ch.doc.id;
          $('inName').textContent = d.fromName || 'Family';
          $('inAvatar').textContent = initial(d.fromName);
          $('inType').textContent = d.video ? 'Video call...' : 'Voice call...';
          $('incoming').classList.remove('hidden');
          if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
        }
        if (ch.type === 'removed' && ch.doc.id === incomingId) hideIncoming();
      });
    }, function () {});
}
function hideIncoming() { incomingId = null; $('incoming').classList.add('hidden'); }

$('btnDecline').onclick = function () {
  var id = incomingId;
  hideIncoming();
  if (id) db.collection('calls').doc(id).update({ status: 'ended' }).catch(function () {});
};

$('btnAccept').onclick = function () {
  var id = incomingId;
  if (!id || pc) return;
  var ref = db.collection('calls').doc(id);
  ref.get().then(function (snap) {
    var d = snap.data();
    hideIncoming();
    if (!d || d.status !== 'ringing') return;
    return getMedia(d.video).then(function (stream) {
      localStream = stream;
      setupPc(d.video);
      gotAnswer = true;
      callId = id;
      pc.onicecandidate = function (e) {
        if (e.candidate) ref.collection('calleeCandidates').add(e.candidate.toJSON());
      };
      showCallUI(d.fromName || 'Family', 'Connecting...');
      return pc.setRemoteDescription(new RTCSessionDescription(d.offer)).then(function () {
        return pc.createAnswer();
      }).then(function (ans) {
        return pc.setLocalDescription(ans).then(function () {
          return ref.update({ answer: { type: ans.type, sdp: ans.sdp }, status: 'active' });
        });
      }).then(function () { watchCall(ref, 'callerCandidates'); });
    });
  }).catch(function (e) {
    endCall(true);
    alert('Call error: ' + (e.message || e));
  });
};

function endCall(notify) {
  var id = callId;
  unsubCall.forEach(function (u) { u(); });
  unsubCall = [];
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
  if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }
  remoteStream = null; callId = null; gotAnswer = false;
  $('remoteVideo').srcObject = null;
  $('localVideo').srcObject = null;
  $('callScreen').classList.add('hidden');
  if (notify && id) db.collection('calls').doc(id).update({ status: 'ended' }).catch(function () {});
}
$('btnHang').onclick = function () { endCall(true); };

$('btnMute').onclick = function () {
  if (!localStream) return;
  var off = !$('btnMute').classList.contains('off');
  localStream.getAudioTracks().forEach(function (t) { t.enabled = !off; });
  $('btnMute').classList.toggle('off', off);
  $('btnMute').textContent = off ? '🔇' : '🎤';
};
$('btnCam').onclick = function () {
  if (!localStream) return;
  var off = !$('btnCam').classList.contains('off');
  localStream.getVideoTracks().forEach(function (t) { t.enabled = !off; });
  $('btnCam').classList.toggle('off', off);
};
