import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function Login() {
  const { user, loading, accessDenied, authError, signIn, retryAuthorization } =
    useAuth();

  // ログイン(認証+認可)済みならホームへ。RequireAuthが children を表示する条件と揃える。
  if (user && !loading && !accessDenied && !authError) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="login-page">
      <h1>money-lens</h1>
      {loading && user && <p role="status">認証を確認しています...</p>}
      {accessDenied && <p role="alert">アクセス権がありません。</p>}
      {authError && (
        <>
          <p role="alert">認証サーバーに接続できませんでした。</p>
          <button type="button" onClick={() => void retryAuthorization()}>
            再試行
          </button>
        </>
      )}
      <button type="button" onClick={() => void signIn()}>
        Googleでログイン
      </button>
    </main>
  );
}
