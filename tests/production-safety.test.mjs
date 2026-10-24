import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const video = fs.readFileSync(path.join(root, 'videocall.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'SETUP.md'), 'utf8');
const voice = fs.readFileSync(path.join(root, 'voicemessage.html'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'overlay.html'), 'utf8');

assert.match(video, /resolveLineStates\(snap\)/, 'video guest page must use the shared producer line-state resolver');
assert.match(video, /if\(callMode==='video' && videoLineState!==LINE\.OPEN\)/, 'video calls must not bypass a closed or unknown producer video line');
assert.match(video, /if\(callMode==='audio' && phoneLineState!==LINE\.OPEN\)/, 'audio calls from the shared caller page must not bypass a closed or unknown phone line');
assert.match(video, /onSnapshot\(doc\(db, 'hotlineSettings', 'callLines'\)/, 'caller page must subscribe to producer line settings');
assert.match(video, /phoneLineState = LINE\.UNKNOWN;\s*videoLineState = LINE\.UNKNOWN;/, 'Firestore read errors must fail closed for live calls');
assert.match(video, /function updateLineUi\(\)/, 'line UI must reflect the currently selected call mode');
assert.match(video, /onicecandidateerror/, 'caller WebRTC must log ICE candidate errors');
assert.match(video, /signInAnonymously\(auth\)/, 'video guest must authenticate anonymously for scoped screening rules');
assert.match(video, /screeningSessions/, 'video guest must answer a separate pre-acceptance screening peer');
assert.match(video, /guestUid/, 'video call must bind screening ownership to the guest UID');
assert.match(dashboard, /Private Guest Screening — Not On Air/, 'dashboard preview must be labeled private and off-air');
assert.match(dashboard, /data-action="video-screen"/, 'video queue must offer a screen-before-answer action');
assert.match(dashboard, /function stopVideoScreening\(/, 'producer must be able to stop the private preview independently');
assert.match(video, /pc\.connectionState === 'failed'/, 'caller must expose failed WebRTC connections');
assert.match(video, /async function finishCallerSession[\s\S]*?await updateDoc\(endingCallRef, \{ status:'ended' \}\)/, 'caller-side WebRTC disconnect must publish ended status so the producer cannot retain a stale line');
assert.match(sw, /requestUrl\.origin !== self\.location\.origin/, 'service worker must not intercept third-party requests');
assert.match(sw, /request\.mode === 'navigate'/, 'offline HTML fallback must be limited to document navigations');
assert.match(sw, /manifest-songrequest\.json/, 'song request PWA manifest must be included in the app shell');
assert.match(dashboard, /\$\{escapeHtml\(typeLabels\[k\]\|\|k\)\}/, 'analytics must escape untrusted message type labels');
assert.match(dashboard, /\$\{escapeHtml\(c\.status \|\| ''\)\}/, 'call history must escape status values before HTML rendering');
assert.doesNotMatch(dashboard, /queueListenerStarted/, 'dashboard queue subscription must be restartable after sign-out');
assert.match(dashboard, /function stopQueueListener\(\)/, 'dashboard must be able to unsubscribe from the queue');
assert.match(dashboard, /function startQueueListener\(\)/, 'dashboard must be able to restart the queue subscription');
assert.match(dashboard, /onicecandidateerror/, 'producer and OBS peers must log ICE candidate errors');
assert.match(dashboard, /RECORDING_UPLOAD_PRESET = 'djdeeze_hotline_recordings'/, 'call recordings must use a dedicated Cloudinary preset');
assert.match(dashboard, /MAX_CALL_RECORDING_BYTES = 50 \* 1024 \* 1024/, 'call recordings must enforce a 50 MB ceiling');
assert.match(dashboard, /AbortController/, 'call recording uploads must have a timeout');
assert.match(dashboard, /Unexpected Cloudinary response URL/, 'call recording uploads must validate the returned media URL');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*update\s*,\s*delete\s*:\s*if\s+true/i, 'setup guide must not recommend public read/update/delete access');
assert.doesNotMatch(setup, /allow\s+read\s*,\s*write\s*:\s*if\s+true/i, 'setup guide must not recommend public read/write access');

assert.match(voice, /playVoicemailBeep/, 'voicemail must play a start beep');
assert.match(voice, /await startRecording\(\)/, 'voicemail recording must start automatically after caller details');
assert.match(voice, /MAX_UPLOAD_BYTES = 8 \* 1024 \* 1024/, 'voice upload must enforce an 8 MB ceiling');
assert.match(voice, /AbortController/, 'voice upload must time out rather than hang indefinitely');

// Legacy OBS relay must fail closed during Hold and off-air transitions.
assert.match(dashboard, /function silenceOverlayRelayMedia\(\)[\s\S]*?sender\.replaceTrack\(null\)/, 'legacy OBS senders must be detached immediately');
assert.match(dashboard, /if\(callIsOnAir\)\{\s*silenceOverlayRelayMedia\(\);\s*await setDoc\(liveStateRef, \{ active:false/, 'holding an on-air caller must immediately deactivate the overlay state');
assert.match(dashboard, /const resumedStatus = callIsOnAir \? 'live' : 'answered';[\s\S]*?await setDoc\(activeCallRef, \{ status: resumedStatus \}/, 'resuming an on-air caller must persist live status before republishing overlay state');
assert.match(dashboard, /if\(!callIsOnAir && callIsOnHold\)[\s\S]*?Resume the caller before sending them on air/, 'a held caller must be resumed before being put back on air');
assert.match(dashboard, /status: callIsOnHold \? 'held' : 'answered'/, 'taking a held caller off air must preserve the held call state');
assert.doesNotMatch(dashboard, /experimentalMultiLine|multiline=1|Experimental · Three-line audio console/, 'dashboard must not expose the experimental three-line panel or opt-in mode');
assert.match(dashboard, /async function takeMultiLineOnAir\(callId\)[\s\S]*?await multiLineAdapter\.takeOnAir\(callId\)[\s\S]*?active:true/, 'multi-line program routing must be explicitly selected and published through the existing live-state document');
assert.match(dashboard, /async function answerMultiLineCall\(callId, callerName, callerCity, lineId\)[\s\S]*?lineId:Number\(lineId\)/, 'incoming audio calls must be assigned to a specific fixed line');
assert.match(dashboard, /const onAir = multiLineOnAirCallId === callId[\s\S]*?onAir \? \(stream\.getAudioTracks\(\)/, 'multi-line OBS relay must send caller audio only after explicit on-air selection');
assert.match(dashboard, /function refreshIsBlockedByLiveMedia\(\)[\s\S]*?multiLineController && multiLineController\.sessions\.size > 0/, 'safe refresh must account for controller-managed live calls');

assert.match(dashboard, /id="multiLineMicMuteBtn"/, 'multi-line phone console must expose a studio microphone mute control');
assert.match(dashboard, /function setMultiLineMicMuted\(muted\)[\s\S]*?track\.enabled=!multiLineMicMuted/, 'studio microphone mute must apply to every connected multi-line caller');
assert.match(dashboard, /localStream\.getAudioTracks\(\)\.forEach\(track=>\{track\.enabled=!multiLineMicMuted;\}\)/, 'new lines must inherit the current studio microphone mute state');
assert.match(dashboard, /const ringingByLine = new Map\(\)[\s\S]*?class="phone-line-tile line-ringing"/, 'waiting callers must light available virtual line tiles before answer');
assert.match(dashboard, /data-action="answer-line" data-line-id="\$\{lineId\}"/, 'ringing line tiles must offer explicit line selection');

assert.match(dashboard, /id="multiLineHoldAudioFile" accept="audio\/\*"/, 'multi-line phone console must allow a local prerecorded hold loop');
assert.match(dashboard, /async function setMultiLineHoldAudio\(callId,held\)[\s\S]*?entry\.session\.replaceTrack\('audio',source\.track\)/, 'held callers must receive the hold-audio track instead of the producer microphone');
assert.match(dashboard, /if\(mic\) mic\.enabled=false;[\s\S]*?entry\.session\.replaceTrack\('audio',source\.track\)/, 'producer microphone must be muted before hold-track replacement');
assert.match(dashboard, /await setMultiLineHoldAudio\(callId,false\);\s*await multiLineAdapter\.takeOnAir\(callId\)/, 'hold audio must be removed before the selected caller is routed on air');
assert.match(dashboard, /await multiLineAdapter\.holdCall\(previousCallId\);\s*await setMultiLineHoldAudio\(previousCallId,true\)/, 'switching callers must persist hold and await the previous caller hold loop before routing the next caller');
assert.match(dashboard, /!snapshot\.programCallId && !multiLineController\.audioRouter\.monitorCallId/, 'private monitoring must not overlap program audio or another monitor route');
assert.match(dashboard, /const onAir = multiLineOnAirCallId === callId;[\s\S]*?const audio=onAir \? \(stream\.getAudioTracks\(\)/, 'OBS relay must continue to use only the selected caller remote stream, never local hold audio');
assert.match(dashboard, /if\(source\.timer\) clearTimeout\(source\.timer\)[\s\S]*?source\.context\?\.close/, 'per-line hold audio resources must be cleaned up');

console.log('production-safety checks: all passed');

assert.match(dashboard, /data-song-action="played"/, 'song requests must have an explicit Mark Played action');
assert.match(dashboard, /function toReliableDate\(/, 'call history must normalize Firestore and legacy date values safely');
assert.match(dashboard, /startedAt: callStartTime \? new Date\(callStartTime\) : null/, 'call history must persist measured call start time');
assert.match(dashboard, /const recorded = calls\.filter\(c => safeCloudinaryMediaUrl\(c\.recordingUrl\)\)/, 'recordings tab must derive its archive from realtime call history while validating media URLs');
assert.match(dashboard, /audioBitsPerSecond:192000/, 'call recordings should request high-bitrate audio');
assert.match(voice, /audioBitsPerSecond:192000/, 'voice messages should request high-bitrate audio');
assert.match(voice, /echoCancellation:true, noiseSuppression:true, autoGainControl:false, sampleRate:\{ideal:48000\}/, 'voice message capture should request echo cancellation, noise suppression, and 48 kHz');
assert.match(voice, /downloadVoiceMessageWav/, 'voice messages must support downloading a WAV copy');

assert.match(dashboard, /data-action="download-recording-wav"/, 'call archive must offer a WAV export alongside the original recording');
assert.match(dashboard, /async function downloadCallRecordingWav\([\s\S]*?const rate=48000/, 'call archive WAV export must resample to 48 kHz PCM');
assert.match(dashboard, /audio\/wav/, 'call archive must generate a WAV file');
assert.match(voice, /const channels=Math\.min\(2,Math\.max\(1,decoded\.numberOfChannels\)\), rate=48000;[\s\S]*?OfflineContextClass\(channels,frames,rate\)/, 'voice message WAV export must resample decoded audio to exactly 48 kHz');

assert.ok(dashboard.includes('data-action="download-recording-mp3"'), 'call archive must offer MP3 export');
assert.ok(dashboard.includes('new lamejs.Mp3Encoder(channels,rate,320)'), 'call archive MP3 must request 320 kbps');
assert.ok(dashboard.includes('async function downloadCallRecordingMp3'), 'call archive MP3 export handler must exist');
assert.ok(voice.includes('id="downloadMp3Btn"'), 'voice message review must offer MP3 download');
assert.ok(voice.includes('new lamejs.Mp3Encoder(channels,rate,320)'), 'voice-message MP3 must request 320 kbps');
assert.ok(voice.includes("live-caller-voice-message-320kbps.mp3"), 'voice-message MP3 must be a separate export file');

assert.match(dashboard, /function safeCloudinaryMediaUrl\(value\)/, 'dashboard must validate untrusted media URLs');
assert.match(dashboard, /url\.hostname !== 'res\.cloudinary\.com'/, 'dashboard media URLs must be restricted to the expected Cloudinary host');
assert.match(dashboard, /url\.pathname\.startsWith\('\/vz1v6nzp\/video\/upload\/'\)/, 'dashboard media URLs must be restricted to the expected upload path');
assert.doesNotMatch(dashboard, /href="\$\{m\.audioUrl\}"/, 'message download links must not interpolate unvalidated media URLs');
assert.doesNotMatch(dashboard, /href="\$\{c\.recordingUrl\}"/, 'archive links must not interpolate unvalidated recording URLs');
assert.doesNotMatch(dashboard, /src="\$\{c\.recordingUrl\}"/, 'archive audio players must not interpolate unvalidated recording URLs');
assert.match(dashboard, /hiddenPlayer\.src = safeAudioUrl/, 'preview and on-air playback must use validated media URLs');
assert.match(overlay, /candidate\.hostname === 'res\.cloudinary\.com'/, 'OBS overlay must reject non-Cloudinary media URLs');
