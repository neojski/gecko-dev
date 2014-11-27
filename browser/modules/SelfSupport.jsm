/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["SelfSupport"];

const Cu = Components.utils;
const BOTTOM_NOTIFICATION_BOX = "global-notificationbox";
const TOP_NOTIFICATION_BOX = "high-priority-global-notificationbox";

/**
 * @params {ChromeWindow} browserWindow - a browser window that will be used to
 *                                        show the notification.
 */
this.SelfSupport = function SelfSupport(browserWindow) {
  this._window = browserWindow;
  this._window.messageManager.addMessageListener("SelfSupport", this);
};

this.SelfSupport.prototype = {
  _window: null,

  uninit: function() {
    this._window.messageManager.removeMessageListener("SelfSupport", this);
  },

  receiveMessage: function(aMessage) {
    if (aMessage.name == "SelfSupport") {
      this.handleShowNotification(aMessage);
    } else {
      Cu.reportError("SelfSupport received unknown message: " + aMessage.name);
    }
  },

  handleShowNotification: function(aMessage) {
    let mm = aMessage.target.messageManager;
    let data = aMessage.data;
    let args = data.args;
    let requestId = data.requestId;

    function sendResponse(args) {
      mm.sendAsyncMessage("SelfSupport", {
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

    let buttons = args.buttons.map(button => {
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
