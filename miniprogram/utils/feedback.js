/**
 * 触控反馈：短震动 + 轻音效（需 /assets/tick.wav）
 */

let _tickAudio = null
const VOL_TAP = 0.85
const VOL_SCROLL = 0.55

function vibrateTap() {
  try {
    wx.vibrateShort({ type: 'medium' })
  } catch (e) {}
}

function playTick(opts) {
  try {
    const vol = opts && opts.volume != null ? opts.volume : VOL_TAP
    if (!_tickAudio) {
      _tickAudio = wx.createInnerAudioContext()
      _tickAudio.src = '/assets/tick.wav'
    }
    _tickAudio.volume = vol
    _tickAudio.stop()
    _tickAudio.play()
  } catch (e) {}
}

function playScrollTick() {
  playTick({ volume: VOL_SCROLL })
}

function uiTapFeedback() {
  vibrateTap()
  playTick({ volume: VOL_TAP })
}

module.exports = {
  vibrateTap,
  playTick,
  playScrollTick,
  uiTapFeedback
}
