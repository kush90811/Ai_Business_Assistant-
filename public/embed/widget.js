/**
 * Tarkshy AI Business Assistant - Chatbot Widget Loader Script
 * 
 * Future external website installation:
 * <script 
 *   src="http://localhost:3000/embed/widget.js" 
 *   data-client-id="YOUR_CLIENT_ID"
 *   async>
 * </script>
 */
(function () {
  // 1. Prevent duplicate loading
  if (window.__TarkshyWidgetInitialized) return;
  window.__TarkshyWidgetInitialized = true;

  // 2. Retrieve script parameters
  const currentScript = document.currentScript || (() => {
    const scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  const clientId = currentScript ? currentScript.getAttribute("data-client-id") : null;
  if (!clientId) {
    console.error("Tarkshy Widget Error: data-client-id attribute is required.");
    return;
  }

  // 3. Create Iframe Container
  const appUrl = "http://localhost:3000";
  const iframe = document.createElement("iframe");
  iframe.src = `${appUrl}/widget/embed?clientId=${clientId}`;
  iframe.id = "tarkshy-chat-iframe";
  
  // Set default launcher dimension styling
  const style = iframe.style;
  style.position = "fixed";
  style.bottom = "24px";
  style.right = "24px";
  style.width = "80px";
  style.height = "80px";
  style.border = "none";
  style.zIndex = "999999";
  style.colorScheme = "dark";
  style.background = "transparent";
  style.transition = "width 0.2s ease, height 0.2s ease";

  document.body.appendChild(iframe);

  // 4. Handle resize events via postMessage (sent by the chat widget)
  window.addEventListener("message", function (event) {
    if (event.origin !== appUrl) return;

    const data = event.data;
    if (data && typeof data === "object") {
      if (data.action === "open") {
        style.width = "420px";
        style.height = "680px";
      } else if (data.action === "close") {
        style.width = "80px";
        style.height = "80px";
      }
    }
  });
})();
