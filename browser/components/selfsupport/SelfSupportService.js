/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function l(msg, dumpStack) {
  let end = "\n";
  if (dumpStack) {
    let st = (new Error()).stack.split("\n").slice(1).map(s => "  " + s).join("\n");
    end = " -- stack:\n" + st + end;
  }
  dump("**********XXXadw SSS.JS " + msg + end);
}

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const NOTIFICATION_PRIORITIES = {
  critical: 8, // PRIORITY_CRITICAL_MEDIUM
  info: 2, // PRIORITY_INFO_MEDIUM
  warning: 5, // PRIORITY_WARNING_MEDIUM
};
const NOTIFICATION_VALUE = "self-support"; // Value to be used with getNotificationWithValue.

Cu.import("resource://gre/modules/Services.jsm");
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
  l("ctor");
}

MozSelfSupportInterface.prototype = {
  classDescription: "MozSelfSupport",
  classID: Components.ID("{d30aae8b-f352-4de3-b936-bb9d875df0bb}"),
  contractID: "@mozilla.org/mozselfsupport;1",
//   QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer]),
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer,
                                         Ci.nsIMessageListener]),

  _window: null,
  _mm: null,

  init: function (window) {
    l("init");
    this._window = window;
    this._mm = window.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDocShell)
                     .QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIContentFrameMessageManager);

    Services.obs.addObserver(this, "dom-window-destroyed", false);
//     Services.obs.addObserver(this, "inner-window-destroyed", false);
    this._mm.addMessageListener("SelfSupportService", this);

    let util = this._window.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindowUtils);
    this.innerWindowID = util.currentInnerWindowID;
  },

  observe: function(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "dom-window-destroyed":
        l("dom-window-destroyed, aSubject=" + aSubject);
        if (aSubject != this._window) {
          l("dom-window-destroyed, not our window");
          return;
        }
        l("dom-window-destroyed, our window");
        Services.obs.removeObserver(this, "dom-window-destroyed");
        this._mm.removeMessageListener("SelfSupportService", this);
        break;
      case "inner-window-destroyed":
        l("inner-window-destroyed");
        let wId = aSubject.QueryInterface(Ci.nsISupportsPRUint64).data;
        if (wId != this.innerWindowID) {
          l("inner-window-destroyed, not our window");
          return;
        }
        l("inner-window-destroyed, our window");
        Services.obs.removeObserver(this, "inner-window-destroyed");
        this._mm.removeMessageListener("SelfSupportService", this);
        break;
    }
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

  _msgId: 0,
  _deferred: {},
  receiveMessage: function(aMessage) {
    var data = aMessage.data;
    var msgId = data.msgId;
    var args = data.args;

    l("receiveMessage data=" + JSON.stringify(data), true);

    var deferred = this._deferred[msgId];
    if (!deferred) {
      // This is not necessarily an error. Since the chrome part of this code is
      // using callback it may happen that after resolve message (button clicked)
      // we'll get a reject message (notification bar closed). Just ignore it.
      return;
    }

    switch (args.type) {
      case "resolve":
        deferred.resolve(args.value);
        break;
      case "reject":
        deferred.reject(args.reason);
        break;
      default:
        Cu.reportError("SelfSupportService got unknown message type: " + args.type + ".");
        return;
    }

    this._deferred[msgId] = null;
  },

  // For now we just ignore aIcon. Default icon (depending on aPriority) will
  // be shown.
  showNotification: function(aLabel, aPriority, aButtons, aIcon) {
    l("showNotification", true);
    return new this._window.Promise((resolve, reject) => {
      l("showNotification promise");
      let msgId = ++this._msgId;
      this._deferred[msgId] = {
        resolve: resolve,
        reject: reject,
      };
      var priority = NOTIFICATION_PRIORITIES[aPriority];
      var positionTop = priority >= NOTIFICATION_PRIORITIES.critical;
      var args = {
        positionTop: positionTop,
        label: aLabel,
        value: NOTIFICATION_VALUE,
        image: null,
        priority: priority,
        buttons: aButtons,
      };
      let data = {args: args, msgId: msgId};
      l("showNotification promise, calling sendAsyncMessage('SelfSupportService') data=" + JSON.stringify(data));
      this._mm.sendAsyncMessage("SelfSupportService", data);
    });
  }
}

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([MozSelfSupportInterface]);
