/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

dictionary NotificationButton {
  DOMString label;
  DOMString id;
  DOMString accessKey;
};

enum NotificationPriority {
  "info",
  "warning",
  "critical",
};

enum NotificationIcon {
  "default",
  "addon",
};

/**
 * The MozSelfSupport interface allows external Mozilla support sites such as
 * FHR and SUMO to access data and control settings that are not otherwise
 * exposed to external content.
 *
 * At the moment, this is a ChromeOnly interface, but the plan is to allow
 * specific Mozilla domains to access it directly.
 */
[ChromeOnly,
 JSImplementation="@mozilla.org/mozselfsupport;1",
 Constructor()]
interface MozSelfSupport
{
  /**
   * Controls whether uploading FHR data is allowed.
   */
  attribute boolean healthReportDataSubmissionEnabled;

  /**
   * Retrieves the FHR payload object, which is of the form:
   *
   * {
   *   version: Number,
   *   clientID: String,
   *   clientIDVersion: Number,
   *   thisPingDate: String,
   *   geckoAppInfo: Object,
   *   data: Object
   * }
   *
   * Refer to the getJSONPayload function in healthreporter.jsm for more
   * information.
   *
   * @return Promise<Object>
   *         Resolved when the FHR payload data has been collected.
   */
  Promise<object> getHealthReportPayload();

  /**
   * Shows notification in browser chrome with the given message and buttons.
   *
   * @param message Message show on the notification bar.
   * @param priority
   * @param buttons List of buttons shown on the notification bar.
   * @param icon Icon for the notification bar. Currently this argument is ignored.
   *             and the default icon (depending on the priority) will be shown.
   * @return Promise<String>
   *         Resolved with the clicked button ID.
   *         Rejected when the notification is canceled without clicking a button.
   */
  Promise<DOMString> showNotification(DOMString message, NotificationPriority priority,
    sequence<NotificationButton> buttons, optional NotificationIcon icon = "default");
};
