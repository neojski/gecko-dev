Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Promise.jsm");

const LABEL = "test label";
const IMAGE = "addon";
const PRIORITY = "warning";
const BUTTON_SPEC = {
  id: "button id",
  label: "button label"
};
const PROXY_URL = "chrome://mochitests/content/browser/browser/components/selfsupport/test/self_support_proxy.html";

function waitForMutation(node, check) {
  let deferred = Promise.defer();
  let observer = new MutationObserver(function onMutatations(mutations) {
    for (let mutation of mutations) {
      if (check (mutation)) {
        observer.disconnect();
        deferred.resolve();
        return;
      }
    }
  });
  observer.observe(node, {childList: true});
  return deferred.promise;
}

function getButtonByLabel(notification, label) {
  return notification.querySelector(`[label="${label}"]`);
}

function waitForLoad(browser) {
  let deferred = Promise.defer();
  browser.addEventListener("load", function onLoad() {
    browser.removeEventListener("load", onLoad, true);
    deferred.resolve();
  }, true);
  return deferred.promise;
}

let prepare = Task.async(function* prepare() {
  let tab = gBrowser.addTab(PROXY_URL);
  gBrowser.selectedTab = tab;
  let browser = tab.linkedBrowser;

  yield waitForLoad(browser);

  browser.messageManager.addMessageListener("showNotificationResponse", aMessage => {
    let data = aMessage.data;
    let type = data.type;
    let deferred = deferreds[data.id];
    info("Got a showNotification response: " + type + ".");
    if  (!deferred) {
      Assert.ok(false, "Deferred with id " + data.id + " not found.");
      return;
    }
    if (type == "resolved") {
      deferred.resolve(data.value);
      return;
    }
    if (type == "rejected") {
      deferred.reject(data.reason);
      return;
    }
    Assert.ok(false, "Wrong message type: " + type + ".");
  });

  browser.messageManager.loadFrameScript(`data:text/javascript,
    /* Global info is not available in content script. */
    function info(msg) {
      dump("INFO(content) " + msg + "\n");
    }
    info("Content loaded frame script.");
    addMessageListener("showNotification", aMessage => {
      info("Content got showNotification request.");
      let data = aMessage.data;
      let args = data.args;
      let promise = content.MozSelfSupport.showNotification(...args);
      promise.then(value => {
        info("showNotification resolved. Sending response from content.");
        sendAsyncMessage("showNotificationResponse", {
          id: data.id,
          type: "resolved",
          value: value,
        });
      }, reason => {
        info("showNotification rejected. Sending response from content.");
        sendAsyncMessage("showNotificationResponse", {
          id: data.id,
          type: "rejected",
          reason: reason,
        });
      });
    });
  `, false);

  let next_id = 0;
  let deferreds = []; // deferreds that will be resolved when showNotification promise resolves
  return {
    selfSupport: {
      // Returns an object {notification, promise}. The promise is returned by
      // MozSelfSupport.showNotification.
      // This function waits until the notification is really shown.
      showNotification: Task.async(function* showNotificationAndWait(...args) {
        let notificationBox = document.getElementById("global-notificationbox");
        let id = next_id++;
        let actionDeferred = Promise.defer();
        deferreds[id] = actionDeferred;

        let randomTimeout = new Promise(resolve => setTimeout(resolve, 1000));
        yield randomTimeout;

        let notificationAddedPromise = waitForMutation(notificationBox, mutation => {
          return mutation.addedNodes.length > 0;
        });

        browser.messageManager.sendAsyncMessage("showNotification", {
          args: args,
          id: id,
        });

        yield notificationAddedPromise;

        let notification = notificationBox.getNotificationWithValue("self-support");
        Assert.ok(notification, "Notification is shown.");
        return {
          notification: notification,
          promise: actionDeferred.promise,
        };
      }),
      closeNotification: function (notification) {
        let promise = waitForMutation(notification.parentNode, mutation => {
          for (let i = 0; i < mutation.removedNodes.length; i++) {
            let node = mutation.removedNodes.item(i);
            if (node == notification) {
              return true;
            }
          }
          return false;
        });
        info("About to call notification.close.");
        notification.close();
        return promise;
      },
    },
    tab: tab,
  };
});

function cleanup(tab) {
  gBrowser.removeTab(tab);
}

function add_self_support_task(task) {
  add_task(function* add_task_fn() {
    let {selfSupport, tab} = yield prepare();
    info("Starting test: "  + task.name);
    yield task(selfSupport);
    cleanup(tab);
  });
}

function assertPromiseRejected(promise, msg) {
  return new Promise((resolve, reject) => {
    let rejected = false;
    promise.then(value => {
      Assert.ok(false, msg);
      reject("Promise shouldn't resolve but resolved with: " + value);
    }, reason => {
      Assert.ok(true, msg);
      resolve(reason);
    });
  });
}

add_self_support_task(function* test_basic_notification(selfSupport) {
  let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [], IMAGE);
  Assert.equal(notification.label, LABEL);
  yield selfSupport.closeNotification(notification);

  yield assertPromiseRejected(promise, "Notification promise should be rejected.");
});

add_self_support_task(function* test_notification_closed(selfSupport) {
  let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [], IMAGE);
  yield selfSupport.closeNotification(notification);

  let reason = yield assertPromiseRejected(promise, "Notification promise should be rejected.");
  Assert.equal(reason, "removed", "Reason: notification removed.");
});

add_self_support_task(function* test_notification_button(selfSupport) {
  let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [BUTTON_SPEC], IMAGE);

  let button1 = getButtonByLabel(notification, BUTTON_SPEC.label);
  Assert.ok(button1, "Button exists.");
  button1.click();

  let value = yield promise;

  Assert.equal(value, BUTTON_SPEC.id, "Reason: notification removed.");
  yield selfSupport.closeNotification(notification);
});
