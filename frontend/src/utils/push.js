import api from "./api"; // sesama folder src/utils/

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush() {
    console.log("VAPID key:", import.meta.env.VITE_VAPID_PUBLIC_KEY);
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("Push notification tidak didukung di browser ini.");
    return { success: false, reason: "unsupported" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { success: false, reason: "permission-denied" };
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY
        ),
      });
    }

    const subJson = subscription.toJSON();

    await api.post("/push/subscribe", {
      endpoint: subJson.endpoint,
      keys: {
        p256dh: subJson.keys.p256dh,
        auth: subJson.keys.auth,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("Gagal subscribe push notification:", error);
    return { success: false, reason: "error", error };
  }
}

export async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api.post("/push/unsubscribe", { endpoint });
    }
  } catch (error) {
    console.error("Gagal unsubscribe push notification:", error);
  }
}