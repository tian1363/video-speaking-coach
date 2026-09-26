const button = document.getElementById("grant");
const status = document.getElementById("permission-status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "正在请求麦克风权限……";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    status.textContent = "授权成功。现在可以关闭此页，回到 YouTube 侧边栏开始语音输入。";
  } catch (error) {
    status.textContent = error.name === "NotAllowedError"
      ? "麦克风权限被拒绝。请检查 Chrome 和系统的麦克风权限设置；也可以直接在侧边栏输入英文。"
      : "麦克风暂不可用。请检查设备连接和系统权限，或直接输入英文。";
  } finally {
    button.disabled = false;
  }
});
