/**
 * 后端未就绪时启用本地假数据（pages 内通过 USE_MOCK 开关）
 * TODO: 联调完成后关闭或删除
 */
const MOCK_USER = {
  id: 'user-mock-001',
  nickname: '演示用户',
  avatar_url: '',
  wx_openid: 'mock-openid',
  created_at: '2026-04-08T00:00:00Z',
  last_login_at: '2026-04-08T12:00:00Z'
}

const MOCK_DEVICES = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    device_sn: 'A1B2C3D4E5F6',
    relay_state: 0,
    online: 1,
    remark_name: '客厅继电器',
    last_seen_at: new Date().toISOString()
  }
]

function mockDelay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

module.exports = {
  MOCK_USER,
  MOCK_DEVICES,
  mockDelay
}
