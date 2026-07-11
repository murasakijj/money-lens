import { useAuth } from "../contexts/useAuth";

export default function Home() {
  const { user, signOutUser } = useAuth();

  return (
    <main>
      <h1>money-lens</h1>
      <p>ログイン中: {user?.email}</p>
      <button type="button" onClick={() => void signOutUser()}>
        ログアウト
      </button>
    </main>
  );
}
