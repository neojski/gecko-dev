/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["SelfSupportService"];

const Cu = Components.utils;

this.SelfSupportService = function SelfSupportService(aWindow) {
  this._window = aWindow;
  this._window.messageManager.addMessageListener("SelfSupportService", this);
};

this.SelfSupportService.prototype = {
  _window: null,

  uninit: function() {
    this._window.messageManager.removeMessageListener("SelfSupportService", this);
  },

  receiveMessage: function(aMessage) {
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

    function sendResponse(args) {
      mm.sendAsyncMessage("SelfSupportService", {
        args: args,
        requestId: requestId,
      });
    }

    function eventCallback(eventName) {
      if (eventName == "removed") {
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
          sendResponse({
            type: "resolve",
            value: button.id,
          });
        }
      }
    });

    let notificationBox = args.positionTop ? TOP_NOTIFICATION_BOX : BOTTOM_NOTIFICATION_BOX;
    this._window.document.getElementById(notificationBox).appendNotification(
      args.label, args.value, args.image, args.priority, buttons, eventCallback);
  },
};
