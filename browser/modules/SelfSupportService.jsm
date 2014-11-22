/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function l(msg, dumpStack) {
  let end = "\n";
  if (dumpStack) {
    let st = (new Error()).stack.split("\n").slice(1).map(s => "  " + s).join("\n");
    end = " -- stack:\n" + st + end;
  }
  dump("**********XXXadw SSS.JSM " + msg + end);
}

this.EXPORTED_SYMBOLS = ["SelfSupportService"];

const Cu = Components.utils;

this.SelfSupportService = function SelfSupportService(aWindow) {
  l("ctor");
  this._window = aWindow;
  this._window.messageManager.addMessageListener("SelfSupportService", this);
};

this.SelfSupportService.prototype = {
  _window: null,

  uninit: function() {
    l("uninit");
    this._window.messageManager.removeMessageListener("SelfSupportService", this);
  },

  receiveMessage: function(aMessage) {
    l("receiveMessage aMessage.name=" + aMessage.name);
    if (aMessage.name == "SelfSupportService") {
      this.handleShowNotification(aMessage);
    } else {
      Cu.reportError("SelfSupportService received unknown message: " + aMessage.name);
    }
  },

  handleShowNotification: function(aMessage) {
    const BOTTOM_NOTIFICATION_BOX = "global-notificationbox";
    const TOP_NOTIFICATION_BOX = "high-priority-global-notificationbox";

    let mm = aMessage.target.messageManager;
    let data = aMessage.data;
    let args = data.args;
    let requestId = data.requestId;

    l("handleShowNotification data=" + JSON.stringify(data));

    function sendResponse(args) {
      l("handleShowNotification, sendResponse requestId=" + requestId + " args=" + JSON.stringify(args));
      mm.sendAsyncMessage("SelfSupportService", {
        args: args,
        requestId: requestId,
      });
    }

    function eventCallback(eventName) {
      l("handleShowNotification, eventCallback eventName=" + eventName);
      if (eventName == "removed") {
        l("handleShowNotification, eventCallback sendResponse");
        sendResponse({
          type: "reject",
          reason: "removed",
        });
      }
    }

    let buttons = args.buttons.map((button) => {
      return {
        label: button.label,
        id: button.id,
        accessKey: button.accessKey,
        callback: () => {
          l("handleShowNotification, button callback button.id=" + button.id);
          sendResponse({
            type: "resolve",
            value: button.id,
          });
        }
      }
    });

    l("handleShowNotification, calling appendNotification");
    let notificationBox = args.positionTop ? TOP_NOTIFICATION_BOX : BOTTOM_NOTIFICATION_BOX;
    this._window.document.getElementById(notificationBox).appendNotification(
      args.label, args.value, args.image, args.priority, buttons, eventCallback);
  },
};
