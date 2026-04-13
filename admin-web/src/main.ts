import { createApp } from 'vue'
import Antd from 'ant-design-vue'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import './style.css'
import './assets/admin-base.css'
import App from './App.vue'
import { router } from './router'

dayjs.locale('zh-cn')

const app = createApp(App)
app.use(router)
app.use(Antd)
app.mount('#app')
