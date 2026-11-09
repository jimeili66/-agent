import { KeyRound, Plus, Radio, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { fetchAccounts, registerAccount, updateAccountPassword } from "./api";
import type { Account, AccountRole } from "./types";

function AccountApp() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AccountRole>("operator");
  const [selectedId, setSelectedId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setAccounts(await fetchAccounts());
    } catch {
      setNotice("账号接口暂不可用，请确认后端服务和 MySQL 已启动。");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    if (!username.trim() || password.length < 6) {
      setNotice("请输入账号，并确保密码至少 6 位。");
      return;
    }
    try {
      const account = await registerAccount(username.trim(), password, role);
      setAccounts((current) => [...current, account]);
      setUsername("");
      setPassword("");
      setNotice(`已创建账号：${account.username}`);
    } catch {
      setNotice("创建失败，账号可能已存在。");
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const accountId = Number(selectedId);
    if (!accountId || newPassword.length < 6) {
      setNotice("请选择账号，并输入至少 6 位的新密码。");
      return;
    }
    try {
      const account = await updateAccountPassword(accountId, newPassword);
      setNewPassword("");
      setNotice(`已修改 ${account.username} 的密码。`);
    } catch {
      setNotice("修改密码失败，请确认账号仍然存在。");
    }
  }

  return (
    <main className="account-page">
      <header className="account-header">
        <div className="auth-brand">
          <span>
            <Radio size={24} />
          </span>
          <div>
            <h1>账号管理</h1>
            <p>创建运营账号、调整密码与查看现有角色。</p>
          </div>
        </div>
      </header>

      <section className="account-grid">
        <article className="account-card">
          <div className="panel-title">
            <div>
              <Plus size={18} />
              <h3>创建账号</h3>
            </div>
            <span>Account</span>
          </div>
          <form className="auth-form" onSubmit={handleCreate}>
            <label>
              账号
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如 operator01" />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
              />
            </label>
            <label>
              角色
              <select value={role} onChange={(event) => setRole(event.target.value as AccountRole)}>
                <option value="admin">admin 管理员</option>
                <option value="operator">operator 运营</option>
              </select>
            </label>
            <button className="primary-action" type="submit">
              <Plus size={17} />
              保存账号
            </button>
          </form>
        </article>

        <article className="account-card">
          <div className="panel-title">
            <div>
              <KeyRound size={18} />
              <h3>修改密码</h3>
            </div>
            <span>Password</span>
          </div>
          <form className="auth-form" onSubmit={handlePasswordUpdate}>
            <label>
              选择账号
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
                <option value="">请选择账号</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.username} · {account.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              新密码
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 6 位"
              />
            </label>
            <button className="secondary-action" type="submit">
              <KeyRound size={17} />
              更新密码
            </button>
          </form>
        </article>
      </section>

      <section className="account-card account-list">
        <div className="panel-title">
          <div>
            <ShieldCheck size={18} />
            <h3>账号列表</h3>
          </div>
          <span>{accounts.length} 个账号</span>
        </div>
        {notice ? <p className="form-status">{notice}</p> : null}
        <div className="account-table">
          {accounts.map((account) => (
            <article key={account.id}>
              <strong>{account.username}</strong>
              <span>{account.role}</span>
              <small>{account.createdAt}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default AccountApp;
