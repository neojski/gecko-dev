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

function l(msg, dumpStack) {
  let end = "\n";
  if (dumpStack) {
    let st = (new Error()).stack.split("\n").slice(1).map(s => "  " + s).join("\n");
    end = " -- stack:\n" + st + end;
  }
  dump("**********XXXadw TEST " + msg + end);
}
SimpleTest.requestCompleteLog();

function waitForMutation(node, check) {
  l("waitForMutation", true);
  let deferred = Promise.defer();
  let observer = new MutationObserver(function onMutatations(mutations) {
    for (let mutation of mutations) {
      if (check (mutation)) {
        l("waitForMutation, got mutation");
        observer.disconnect();
        deferred.resolve();
        return;
      }
    }
  });
  observer.observe(node, {childList: true});
  return deferred.promise;
}

function _closeNotification(notification) {
  let promise = waitForMutation(notification.parentNode, (mutation) => {
    for (let i = 0; i < mutation.removedNodes.length; i++) {
      let node = mutation.removedNodes.item(i);
      return node == notification;
    }
  });
  info("About to call notification.close.");
  notification.close();
  return promise;
}

function getButtonByLabel(notification, label) {
  return notification.querySelector("[label=\"" + label + "\"]");
}

function waitForLoad(browser) {
  l("waitForLoad", true);
  let deferred = Promise.defer();
  browser.addEventListener("load", function onLoad() {
    l("waitForLoad, got load");
    browser.removeEventListener("load", onLoad, true);
    deferred.resolve();
  }, true);
  return deferred.promise;
}

let prepare = Task.async(function* prepare() {
  l("prepare", true);
  let tab = gBrowser.addTab(PROXY_URL);
  gBrowser.selectedTab = tab;
  let browser = tab.linkedBrowser;

  l("prepare, calling waitForLoad");
  yield waitForLoad(browser);
  l("prepare, done calling waitForLoad");

  browser.messageManager.addMessageListener("showNotificationResponse", (aMessage) => {
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

  l("prepare, calling loadFrameScript");
  browser.messageManager.loadFrameScript(`data:text/javascript,
    /* Global info is not available in content script. */
    function info(msg) {
      dump("INFO(content) " + msg + "\n");
    }
    info("Content loaded frame script.");
    addMessageListener("showNotification", (aMessage) => {
      info("Content got showNotification request.");
      let data = aMessage.data;
      let args = data.args;
      let promise = content.MozSelfSupport.showNotification(...args);
      promise.then((value) => {
        info("showNotification resolved. Sending response from content.");
        sendAsyncMessage("showNotificationResponse", {
          id: data.id,
          type: "resolved",
          value: value,
        });
      }, (reason) => {
        info("showNotification rejected. Sending response from content.");
        sendAsyncMessage("showNotificationResponse", {
          id: data.id,
          type: "rejected",
          reason: reason,
        });
      });
    });
  `, false);
  l("prepare, done calling loadFrameScript");

  let next_id = 0;
  let deferreds = []; // deferreds that will be resolved when showNotification promise resolves
  return {
    selfSupport: {
      // Returns an object {notification, promise}. The promise is returned by
      // MozSelfSupport.showNotification.
      // This function waits until the notification is really shown.
      showNotification: Task.async(function* showNotificationAndWait(...args) {
        l("showNotificationAndWait");

        let notificationBox = document.getElementById("global-notificationbox");
        let id = next_id++;
        let actionDeferred = Promise.defer();
        deferreds[id] = actionDeferred;

        l("showNotificationAndWait, waiting");
        let randomTimeout = new Promise(resolve => setTimeout(resolve, 1000));
        yield randomTimeout;
        l("showNotificationAndWait, done waiting");

        let notificationAddedPromise = waitForMutation(notificationBox, (mutation) => {
          l("showNotificationAndWait, notificationAddedPromise waitForMutation: " + (mutation.addedNodes.length > 0));
          return mutation.addedNodes.length > 0;
        });

        l("showNotificationAndWait, calling sendAsyncMessage('showNotification')");
        browser.messageManager.sendAsyncMessage("showNotification", {
          args: args,
          id: id,
        });

        l("showNotificationAndWait, yield notificationAddedPromise");
        yield notificationAddedPromise;
        l("showNotificationAndWait, done yield notificationAddedPromise");

        let notification = notificationBox.getNotificationWithValue("self-support");
        Assert.ok(notification, "Notification is shown.");
        return {
          notification: notification,
          promise: actionDeferred.promise,
        };
      }),
      closeNotification: _closeNotification,
    },
    tab: tab
  };
});

function cleanup(tab) {
  l("cleanup", true);
  gBrowser.removeTab(tab);
}

function add_self_support_task(task) {
  l("add_self_support_task, calling add_task", true);
  add_task(function* add_task_fn() {
    l("add_task_fn, calling prepare", true);
    let {selfSupport, tab} = yield prepare();
    l("add_task_fn, done calling prepare");
    info("Starting test: "  + task.name);
    l("add_task_fn, calling task");
    yield task(selfSupport);
    l("add_task_fn, done calling task");
    cleanup(tab);
    l("add_task_fn, all done!");
  });
  l("add_self_support_task, done calling add_task");
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
  l("test_basic_notification, calling selfSupport.showNotification", true);
  let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [], IMAGE);
  l("test_basic_notification, done calling selfSupport.showNotification");
  Assert.equal(notification.label, LABEL);
  l("test_basic_notification, calling selfSupport.closeNotification");
  yield selfSupport.closeNotification(notification);
  l("test_basic_notification, done calling selfSupport.closeNotification");

  l("test_basic_notification, calling assertPromiseRejected");
  yield assertPromiseRejected(promise, "Notification promise should be rejected.");
});

// add_self_support_task(function* test_notification_closed(selfSupport) {
//   let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [], IMAGE);
//   yield selfSupport.closeNotification(notification);

//   let reason = yield assertPromiseRejected(promise, "Notification promise should be rejected.");
//   Assert.equal(reason, "removed", "Reason: notification removed.");
// });

// add_self_support_task(function* test_notification_button(selfSupport) {
//   let {notification, promise} = yield selfSupport.showNotification(LABEL, PRIORITY, [BUTTON_SPEC], IMAGE);

//   let button1 = getButtonByLabel(notification, BUTTON_SPEC.label);
//   button1.click();

//   let value = yield promise;

//   Assert.equal(value, BUTTON_SPEC.id, "Reason: notification removed.");
//   yield selfSupport.closeNotification(notification);
// });
