/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Components.utils.import("resource://gre/modules/DOMRequestHelper.jsm");

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const NOTIFICATION_PRIORITIES = {
  info: 2, // PRIORITY_INFO_MEDIUM
  warning: 5, // PRIORITY_WARNING_MEDIUM
  critical: 8, // PRIORITY_CRITICAL_MEDIUM
};
const NOTIFICATION_VALUE = "self-support"; // Value to be used with getNotificationWithValue.

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const policy = Cc["@mozilla.org/datareporting/service;1"]
                 .getService(Ci.nsISupports)
                 .wrappedJSObject
                 .policy;

XPCOMUtils.defineLazyGetter(this, "reporter", () => {
  return Cc["@mozilla.org/datareporting/service;1"]
           .getService(Ci.nsISupports)
           .wrappedJSObject
           .healthReporter;
});

function MozSelfSupportInterface() {
}

MozSelfSupportInterface.prototype = {
  __proto__: DOMRequestIpcHelper.prototype,
  classDescription: "MozSelfSupport",
  classID: Components.ID("{d30aae8b-f352-4de3-b936-bb9d875df0bb}"),
  contractID: "@mozilla.org/mozselfsupport;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer,
                                         Ci.nsIMessageListener,
                                         Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),

  init: function (aWindow) {
    let mm = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDocShell)
                     .QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIContentFrameMessageManager);

    this.initDOMRequestHelper(aWindow, ["SelfSupport"], mm);
  },

  get healthReportDataSubmissionEnabled() {
    return policy.healthReportUploadEnabled;
  },

  set healthReportDataSubmissionEnabled(enabled) {
    let reason = "Self-support interface sent " +
                 (enabled ? "opt-in" : "opt-out") +
                 " command.";
    policy.recordHealthReportUploadEnabled(enabled, reason);
  },

  getHealthReportPayload: function () {
    return new this._window.Promise(function (aResolve, aReject) {
      if (reporter) {
        let resolvePayload = function () {
          reporter.collectAndObtainJSONPayload(true).then(aResolve, aReject);
        };

        if (reporter.initialized) {
          resolvePayload();
        } else {
          reporter.onInit().then(resolvePayload, aReject);
        }
      } else {
        aReject(new Error("No reporter"));
      }
    }.bind(this));
  },

  receiveMessage: function(aMessage) {
    let data = aMessage.data;
    let args = data.args;
    let requestId = data.requestId;
    let resolver = this.takePromiseResolver(requestId);

    switch (args.type) {
      case "resolve":
        resolver.resolve(args.value);
        break;
      case "reject":
        resolver.reject(args.reason);
        break;
      default:
        Cu.reportError("SelfSupport got unknown message type: " + args.type + ".");
        return;
    }
  },

  // For now we just ignore aIcon. Default icon (depending on aPriority) will
  // be shown.
  showNotification: function(aLabel, aPriority, aButtons, aIcon) {
    return this.createPromise((resolve, reject) => {
      let priority = NOTIFICATION_PRIORITIES[aPriority];
      let positionTop = priority >= NOTIFICATION_PRIORITIES.critical;
      let args = {
        positionTop: positionTop,
        label: aLabel,
        value: NOTIFICATION_VALUE,
        image: null,
        priority: priority,
        buttons: aButtons,
      };
      let data = {
        args: args,
        requestId: this.getPromiseResolverId({
          resolve: resolve,
          reject: reject
        })
      };
      this._mm.sendAsyncMessage("SelfSupport", data);
    });
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([MozSelfSupportInterface]);
