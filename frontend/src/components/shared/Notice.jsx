// A coloured message box. type: "error" | "info" | "success"
export default function Notice({ type = "info", children }) {
  return <div className={`notice notice-${type}`}>{children}</div>;
}
