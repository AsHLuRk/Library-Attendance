// Browser-side helper for calling this app's own API routes.
export async function apiFetch(path, { method = "GET", body, password } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-app-password": password || "",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Could not reach the server. Check your internet connection.");
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON response (e.g. a platform timeout page) */
  }
  if (!res.ok) {
    let msg = data.error;
    if (!msg) {
      if (res.status === 413) msg = "The photo is too large. Try a smaller photo.";
      else if (res.status === 504) msg = "The server took too long. Please try again.";
      else msg = `Request failed (${res.status}).`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
