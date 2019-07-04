/** 
 *	HabuL namespace
 */
if ("undefined" == typeof(HabuL)) {
	var HabuL = {
		
		debugDump: function(aMessage) {
		  var consoleService = Components.classes["@mozilla.org/consoleservice;1"]
										 .getService(Components.interfaces.nsIConsoleService);
		  consoleService.logStringMessage("HabuL: " + aMessage);
		},
			
		prefserv : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch),
		
		//L: added for the v8 breakup
		getBoolPref : function(prefName) {
			if (!HabuL.prefserv.prefHasUserValue(prefName)) {
				HabuL.prefserv.setBoolPref(prefName, false);
				return false;
			}
			return HabuL.prefserv.getBoolPref(prefName);
		},

		//L: added by legolas558 for Thunderbird v3 compatibility
		SetNextMessageAfterDelete: function () {
			var treeSelection = GetThreadTree().view.selection;

			if (treeSelection.isSelected(treeSelection.currentIndex)) {
				gNextMessageViewIndexAfterDelete = gDBView.msgToSelectAfterDelete;
				gSelectedIndexWhenDeleting = treeSelection.currentIndex;
			}
			else if (gDBView.removeRowOnMoveOrDelete) {
				// Only set gThreadPaneDeleteOrMoveOccurred to true if the message was
				// truly moved to the trash or deleted, as opposed to an IMAP delete
				// (where it is only "marked as deleted".  This will prevent bug 142065.
				//
				// If it's an IMAP delete, then just set gNextMessageViewIndexAfterDelete
				// to treeSelection.currentIndex (where the outline is at) because nothing
				// was moved or deleted from the folder.
				gThreadPaneDeleteOrMoveOccurred = true;
				gNextMessageViewIndexAfterDelete = treeSelection.currentIndex - NumberOfSelectedMessagesAboveCurrentIndex(treeSelection.currentIndex);
			} else
				gNextMessageViewIndexAfterDelete = treeSelection.currentIndex;
		},

		SendMailTo: function (emailAddress, msgfServer, messages, attachmentURIs) {			
			var msgComposeService = Components.classes["@mozilla.org/messengercompose;1"].getService(Components.interfaces.nsIMsgComposeService);

			var fields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields),
				params = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
			if (emailAddress && fields && params) {
				var attachmentURI = "", i, it, attachment;
				for (i = 0, it=attachmentURIs.length; i < it; i++) {
					attachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Components.interfaces.nsIMsgAttachment);
					attachment.url = attachmentURIs[i];
					fields.addAttachment(attachment);
				}

				params.originalMsgURI = attachmentURI;

				fields.to = emailAddress;
				fields.subject = "[HabuL Plugin] Spam Report";
				fields.body = msg_okopipiMessageBody.replace("#1", attachmentURIs.length);
				params.type = Components.interfaces.nsIMsgCompType.New; // ForwardAsAttachment or New
				params.format = Components.interfaces.nsIMsgCompFormat.PlainText;
				params.identity = accountManager.getFirstIdentityForServer(msgfServer);
				params.composeFields = fields;

				// dynamically generate a hook with proper parameters
				params.sendListener = {
					sendFailed: false,
					onGetDraftFolderURI: function (folderURI) {},
					onProgress: function (msgID, progress, progressMax) {},
					onSendNotPerformed: function (msgID, status) {
						params.sendListener.sendFailed = true;
						HabuL.debugDump("send failed");
					},
					onStartSending: function (msgID, msgSize) {},
					onStatus: function (msgID, msg) {},
					
					onStopSending: function (msgID, status, msg, returnFileSpec) {
						//L: delete spam messages only if they were sent successfully
						if (msgID !== null && !params.sendListener.sendFailed) {
							HabuL.DeleteJunkMail(this.action, this.messages);
						}
					},
					
					// store preference here statically
					action: HabuL.getAction(),
					
					// all message ids we picked up from the treeview
					messages: messages
				};
				
				
				msgComposeService.OpenComposeWindowWithParams(null, params);
			}

		}, // SendMailTo
		
		//L: added by legolas558 for Thunderbird v3 compatibility
		GetLoadedMsgFolder: function () {
			if (!gDBView) return null;
			return gDBView.msgFolder;
		},

		DeleteJunkMail: function (action, messages) {
			if (1 == action) // delete completely
				HabuL.deleteJunk(false, messages);
			else if (2 == action)
				HabuL.deleteJunk(true, messages);

			ClearThreadPaneSelection();
			
			// clear message pane if nothing left
			window.setTimeout(HabuL.ClearAction, 1);

		}, // DeleteJunkMail
		
		ClearAction: function() {
			var view = gDBView;
			var treeView = view.QueryInterface(Components.interfaces.nsITreeView);
			if (treeView.rowCount == 0) {
				gHaveLoadedMessage = true;
				ClearMessagePane();
			}
		},
		
		deleteJunk: function (trash, messages) {
			var view = gDBView,
				treeView = view.QueryInterface(Components.interfaces.nsITreeView),
				count = treeView.rowCount,
				treeSelection = treeView.selection,
				//L: we will clear selection only once when necessary
				clearedSelection = false,
				// select the junk messages
				messCount = 0, messageUri, msgHdr;
			
			for (var i = 0; i < count; i++) {
				messageUri = view.getURIForViewIndex(i);
				msgHdr = messenger.messageServiceFromURI(messageUri).messageURIToMsgHdr(messageUri);

				// skip this message if it was not previously picked
				if (messages.indexOf(msgHdr.messageId) === -1)
					continue;

				if (!clearedSelection) {
					treeSelection.clearSelection();
					clearedSelection = true;
					treeSelection.selectEventsSuppressed = true;
				}

				++messCount;
				treeSelection.rangedSelect(i, i, true /* augment */ );
			}

			//L: there was no junk so mission ends here
			if (!clearedSelection) return;

			// restore user selection
			treeSelection.selectEventsSuppressed = false;

			// should we try to set next message after delete
			// to the message selected before we did all this, if it was not junk?
			HabuL.SetNextMessageAfterDelete();

			// send the delete command (DANGEROUS! can delete something selected by user meanwhile)
			view.doCommand(trash ? nsMsgViewCommandType.deleteMsg : nsMsgViewCommandType.deleteNoTrash);
		}, // deleteJunk

		//L: called from messenger.xul
		ReportJunk: function (event) {
		
			//L: added by legolas558 for Thunderbird v3 compatibility
			var msgf = HabuL.GetLoadedMsgFolder();
			// if there's no active folder, can't report
			if (msgf === null) return;

			//RFC
			MsgJunkMailInfo(true);
			var view = gDBView;

			// need to expand all threads, so we find everything
			view.doCommand(nsMsgViewCommandType.expandAll);

			var treeView = view.QueryInterface(Components.interfaces.nsITreeView),
				count = treeView.rowCount;

			if (count == 0)
				return;

			var messages = [];
					
			var	treeSelection = treeView.selection,
				attachmentURIs = [],
				maxJunkToPick = HabuL.getMaxJunkToPick();

			// select the junk messages
			for (var i = 0; i < count; i++) {
				var messageUri = view.getURIForViewIndex(i);
				var msgHdr = messenger.messageServiceFromURI(messageUri).messageURIToMsgHdr(messageUri);
				var junkScore = msgHdr.getStringProperty("junkscore");
				var isJunk = ((junkScore != "") && (junkScore != "0"));
				
				// if the message is junk, pick it.
				if (isJunk) {
					attachmentURIs.push(messageUri);
					messages.push(msgHdr.messageId);
					
					// we collect only a certain amount of junk
					if (messages.length == maxJunkToPick)
						break;
				}
			}

			if (0 == attachmentURIs.length) {
				alert(msg_okopipiNoJunk);
			} else {
				// open the composer window
				HabuL.SendMailTo(HabuL.getRecipients(), msgf.server, messages, attachmentURIs);
			}
			
		}, // ReportJunk
		
		getRecipients: function() {
				var prefID = "habul.okspamcop", okuserid;
				if (HabuL.getBoolPref(prefID) == true) {
					prefID = "habul.okuserid";
					if (HabuL.prefserv.prefHasUserValue(prefID)) {
						okuserid = HabuL.prefserv.getCharPref(prefID);
					} else {
						okuserid = prompt(msg_okopipiIdPrompt);
						HabuL.prefserv.setCharPref(prefID, okuserid);
					}

					prefID = "habul.quickspamcop";
					if (HabuL.getBoolPref(prefID) == true) {
						okuserid = "quick." + okuserid + "@spam.spamcop.net";
					} else {
						okuserid = "submit." + okuserid + "@spam.spamcop.net";
					}
				} else {
					okuserid = "";
				}

				prefID = "habul.okcustid";
				var okcustid;
				if (HabuL.prefserv.prefHasUserValue(prefID)) {
					okcustid = HabuL.prefserv.getCharPref(prefID);
				} else {
					okcustid = prompt(msg_okopipicIdPrompt);
					HabuL.prefserv.setCharPref(prefID, okcustid);
				}

				prefID = "habul.knujonreports";
				var knujonuserId, knujonreports;
				if (HabuL.getBoolPref(prefID) == true) {
					prefID = "habul.knujonuserId";
					if (HabuL.prefserv.prefHasUserValue(prefID)) {
						knujonuserId = HabuL.prefserv.getCharPref(prefID);
					} else {
						knujonuserId = "nonreg";
					}
					knujonreports = knujonuserId + "@knujon.net";
				} else {
					knujonreports = "";
				}

				var okftc, okfda, usareports;
				prefID = "habul.usareports";
				if (HabuL.getBoolPref(prefID) == true) {
					prefID = "habul.ftcreports";
					if (HabuL.getBoolPref(prefID) == true) okftc = "spam@uce.gov";
					else okftc = "";

					prefID = "habul.fdareports";
					if (HabuL.getBoolPref(prefID) == true) okfda = "webcomplaints@ora.fda.gov";
					else okfda = "";

					usareports = okftc + "," + okfda;
				} else {
					usareports = "";
				}

				prefID = "habul.aureports";
				var okacmaId, aureports;
				if (HabuL.getBoolPref(prefID) == true) {
					prefID = "habul.okacmaId";
					if (HabuL.prefserv.prefHasUserValue(prefID))
						okacmaId = HabuL.prefserv.getCharPref(prefID);
					else okacmaId = "anonymous";
					aureports = okacmaId + "@submit.spam.acma.gov.au";
				} else {
					aureports = "";
				}

				var okmailto = okuserid + "," + okcustid + "," + usareports + "," + aureports + "," + knujonreports;
			
			return okmailto;
		},

		// can be 1 or 2 depending on whether junk mail gets deleted or moved to trash
		getAction: function() {
			var prefID = "habul.action";
			return HabuL.prefserv.prefHasUserValue(prefID) ? HabuL.prefserv.getIntPref(prefID) : 2;
		},

		// maximum amount of junk to pick
		getMaxJunkToPick: function() {
			var prefID = "habul.maxJunkToPick";
			return HabuL.prefserv.prefHasUserValue(prefID) ? HabuL.prefserv.getIntPref(prefID) : 500;
		}

	}; // HabuL
}
