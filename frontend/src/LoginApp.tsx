import { LockKeyhole, Radio } from "lucide-react";
import { FormEvent, useState } from "react";
import { AUTH_TOKEN_KEY, loginAccount } from "./api";

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
      <section className="auth-panel">
        <div className="auth-brand">
          <span>
            <Radio size={24} />
          </span>
          <div>
            <strong>直播电商 Agent 工作台</strong>
            <p>管理端登录</p>
          </div>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            账号
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入管理员账号" />
          </label>
          <label>
            密码
            <input
              type="password"
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
      </section>
    </main>
  );
}

export default LoginApp;
