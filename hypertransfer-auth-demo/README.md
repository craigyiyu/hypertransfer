# HyperTransfer Auth Demo — 手机号短信 OTP + TOTP 双因子

面向 `h5.hypercypto.com` 的**注册 / 登录链路演示**:移动端 H5 页面 + Python(FastAPI)后端。

身份模型(贴近真实 crypto 入金产品):
- **第一因子**:手机号 + **真实短信 OTP**(走 Hypervelocity `simpleSend` 网关,QA 环境)
- **第二因子**:**TOTP 验证器 App**(标准 RFC 6238,SHA1/6 位/30 秒,兼容 Google / Microsoft Authenticator、Authy、1Password、苹果「密码」等**所有主流验证器**)
- 另含登录密码(something you know)

> ⚠️ 仅演示 / 真机体验,**不是生产实现**。生产化清单见 `server.py` 底部。

## 技术栈
- 后端:Python + FastAPI + Uvicorn,`pyotp`(TOTP)、`qrcode`(二维码),SQLite 存储
- 短信:`urllib` 直接调 `POST https://hv-test.hypervelocity.cn/api/sms/simpleSend`
- 前端:单文件 `static/index.html`(移动优先,原生 JS,免构建),后端同源托管

## 跑起来(电脑上)
```bash
cd hypertransfer-auth-demo
./run.sh          # 自动建 venv、装依赖、启动,并打印手机访问地址
```
启动后终端打印手机访问地址,例如 `http://192.168.x.x:8000`。

## 在手机上测试(真实短信)
1. **手机和电脑连同一个 WiFi**,手机浏览器打开 `http://<电脑局域网IP>:8000`。
2. **注册第一步**:选区号 + 填手机号 → 点「获取验证码」→ **收真实短信** → 填 6 位码 + 设密码 → 点「下一步」。
3. **注册第二步(绑 TOTP)**:用验证器 App 扫码 / 点「📲 添加到验证器」/ 手动输入密钥 → 填验证器当前 6 位码 → 完成绑定并自动登录。
4. **登录**:手机号 + 密码 + 验证器当前 6 位码。

> 短信限频:同号 60 秒只能发一次、每日上限 10 条、单码最多试错 5 次。

## 接口
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/send-otp` | 发送手机号短信验证码(第一因子) |
| POST | `/api/register` | 校验短信码 + 设密码,返回 TOTP 密钥/二维码 |
| POST | `/api/confirm-totp` | 校验首个 TOTP,完成绑定并发会话 |
| POST | `/api/login` | 手机号 + 密码 + TOTP 登录 |
| GET  | `/api/me` | `Authorization: Bearer <token>` 查当前用户 |
| POST | `/api/logout` | 注销会话 |

## 短信网关说明
- QA 环境免白名单;成功响应实测为 `code=0` + `message=SUCCESS`(文档写 `code=200`,后端两者都兼容)。
- 大陆号码用国内签名 `【武汉极数信息技术】`,国际号码用 `[Hypervelocity]`。

## 注意
- 数据存本地 `auth_demo.db`(SQLite),删掉即清库。
- 未绑定完成的注册可用同一手机号**重新走流程覆盖**,方便反复测试。
- TOTP 已做**防重放**(同一 30 秒窗口的码只接受一次)和**时钟漂移容忍**(±30 秒);短信 OTP **用后即失效**。
