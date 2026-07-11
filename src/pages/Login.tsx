import { useAuth } from "../contexts/useAuth";

export default function Login() {
  const { signIn, accessDenied } = useAuth();

  return (
    <main className="login-page">
      <h1>money-lens</h1>
      {accessDenied && <p role="alert">アクセス権がありません。</p>}
      <button type="button" onClick={() => void signIn()}>
        Googleでログイン
      </button>
    </main>
  );
}
