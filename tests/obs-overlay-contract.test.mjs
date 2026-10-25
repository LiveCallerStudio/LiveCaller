import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlay = fs.readFileSync(new URL('../overlay.html', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(overlay, /html,body\{[^}]*width:1920px;height:1080px/,
  'OBS overlay canvas must be fixed at 1920×1080');
assert.match(overlay, /pc\.addTransceiver\('audio',\{direction:'recvonly'\}\)/,
  'OBS overlay must receive caller audio and never send a producer microphone');
assert.match(overlay, /if\(isVideo\) pc\.addTransceiver\('video',\{direction:'recvonly'\}\)/,
  'OBS overlay video lane must be receive-only and created only for video calls');
assert.match(overlay, /\['livecall','livevideo'\]/,
  'overlay must accept both audio and video on-air call types');
assert.match(dashboard, /const mediaType = callData\.mediaType === 'video' \? 'video' : 'audio'/,
  'line answer flow must preserve the incoming caller media type');
assert.match(dashboard, /video: mediaType === 'video'/,
  'video callers must negotiate a producer camera track for the private two-way call');
assert.match(dashboard, /mediaType,\s*localStream,/,
  'the selected line session must retain the audio/video call type');
assert.match(dashboard, /messageType:line\.mediaType === 'video' \? 'livevideo' : 'livecall'/,
  'on-air state must activate the matching audio/video OBS receiver mode');
assert.match(dashboard, /const video=onAir && entry\.mediaType==='video'/,
  'caller video must be detached unless that video caller is selected on air');
assert.match(dashboard, /const audio=onAir \? \(stream\.getAudioTracks\(\)\.find\(track=>track\.readyState==='live'\)\|\|null\) : null/,
  'caller audio must be detached unless that caller is selected on air');
assert.doesNotMatch(dashboard, /Video calls use the existing video screening workflow/,
  'video callers must be answerable on any available line');
console.log('OBS 1920×1080 and caller-only audio/video line contract: all checks passed');
