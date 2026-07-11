import { useEffect, useState } from "react";
import { useAuth } from "../contexts/useAuth";
import {
  DataConflictError,
  getData,
  putData,
  type DataFile,
} from "../lib/dataClient";

type Settings = Record<string, unknown>;

export default function Home() {
  const { user, signOutUser } = useAuth();
  const [settingsFile, setSettingsFile] = useState<DataFile<Settings> | null>(
    null,
  );
  const [text, setText] = useState("");
  const [status, setStatus] = useState("設定を読み込んでいます...");

  useEffect(() => {
    void getData<Settings>("settings.json")
      .then((file) => {
        setSettingsFile(file);
        setText(JSON.stringify(file.content, null, 2));
        setStatus("");
      })
      .catch(() => setStatus("設定を読み込めませんでした。"));
  }, []);

  const save = async () => {
    if (!settingsFile) return;
    let content: Settings;
    try {
      content = JSON.parse(text) as Settings;
    } catch {
      setStatus("JSONの形式が正しくありません。");
      return;
    }

    setStatus("保存しています...");
    try {
      const result = await putData(
        "settings.json",
        settingsFile.sha,
        content,
        "update settings.json",
      );
      setSettingsFile({ file: "settings.json", sha: result.sha, content });
      setStatus("保存しました。");
    } catch (err) {
      if (err instanceof DataConflictError) {
        const latest = err.latest as DataFile<Settings>;
        setSettingsFile(latest);
        setText(JSON.stringify(latest.content, null, 2));
        setStatus("他の変更があったため、最新版を再読み込みしました。");
        return;
      }
      setStatus("保存できませんでした。");
    }
  };

  return (
    <main>
      <h1>money-lens</h1>
      <p>ログイン中: {user?.email}</p>
      <button type="button" onClick={() => void signOutUser()}>
        ログアウト
      </button>
      <section>
        <h2>設定</h2>
        <textarea
          aria-label="settings.json"
          rows={18}
          cols={70}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!settingsFile}
        />
        <div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!settingsFile}
          >
            保存
          </button>
        </div>
        {status && <p role="status">{status}</p>}
      </section>
    </main>
  );
}
