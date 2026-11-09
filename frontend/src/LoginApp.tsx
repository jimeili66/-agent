import { LineChart, LockKeyhole, MessagesSquare, Mic2, PackageCheck, Radio } from "lucide-react";
import { FormEvent, useState } from "react";
import { AUTH_TOKEN_KEY, loginAccount } from "./api";

const studioFeatures = [
  { icon: PackageCheck, title: "商品上架", desc: "直播价、库存与优惠规则统一维护" },
  { icon: Mic2, title: "主播话术", desc: "开场、促销、互动、收尾分段生成" },
  { icon: MessagesSquare, title: "弹幕问答", desc: "Agent 识别意图与情绪，实时应答" },
  { icon: LineChart, title: "销售复盘", desc: "订单、转化与合规风险一目了然" },
];

function LoginApp() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const data = await loginAccount(username.trim(), password);
      localStorage.setItem(AUTH_TOKEN_KEY, data.accessToken);
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") || "/admin/dashboard";
    } catch {
      setError("账号或密码错误，请重新输入。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-studio" aria-label="直播电商 Agent 工作台">
        <div className="studio-top">
          <span className="studio-mark" aria-hidden="true">
            <Radio size={22} />
          </span>
          <span className="studio-chip">直播电商 Agent 工作台</span>
        </div>
        <div className="studio-hero">
          <h1>
            把每场直播
            <br />
            管在一个地方
          </h1>
          <p>从商品上架、主播话术到弹幕问答与销售复盘，运营团队只需要一个工作台。</p>
        </div>
        <ul className="studio-features">
          {studioFeatures.map(({ icon: Icon, title, desc }) => (
            <li key={title}>
              <span className="feature-icon" aria-hidden="true">
                <Icon size={19} />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <section className="auth-side" aria-labelledby="admin-sign-in">
        <div className="auth-panel">
          <div className="auth-brand">
            <span>
              <Radio size={24} />
            </span>
            <div>
              <h2 id="admin-sign-in">管理端登录</h2>
              <p>使用你的运营账号继续</p>
            </div>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              账号
              <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入管理员账号" />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" type="submit" disabled={isSubmitting}>
              <LockKeyhole size={17} />
              {isSubmitting ? "登录中" : "登录管理端"}
            </button>
          </form>
          <p className="auth-tip">请输入管理员账号登录，账号密码可在账号端维护。</p>
        </div>
      </section>
    </main>
  );
}

export default LoginApp;
