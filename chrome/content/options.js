/** 
 *	HabuLOptions namespace
 */
if ("undefined" == typeof(HabuLOptions)) {
	var HabuLOptions = {

		_elementIDs: ["okuserid", "action", "okcustid", "ftcreports", "okspamcop", "quickspamcop", "fdareports", "aureports", "usareports", "okacmaId", "knujonreports", "knujonuserId"],

		prefserv : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch),
		
		//L: added for the v8 breakup
		getBoolPref : function(prefName) {
			if (!HabuLOptions.prefserv.prefHasUserValue(prefName)) {
				HabuLOptions.prefserv.setBoolPref(prefName, false);
				return false;
			}
			return HabuLOptions.prefserv.getBoolPref(prefName);
		},
		
		initOptions: function () {
			var element, eltType;

			// initialize the default window values...
			for (var i = 0, it = HabuLOptions._elementIDs.length; i < it; i++) {
					element = document.getElementById(HabuLOptions._elementIDs[i]);
					if (!element) break;
					eltType = element.localName;
					try {
						if (eltType == "radiogroup") element.selectedIndex = HabuLOptions.prefserv.getIntPref(element.getAttribute("prefstring"))
						else if (eltType == "checkbox") element.checked = HabuLOptions.getBoolPref(element.getAttribute("prefstring"));
						else if (eltType == "textbox") element.value = HabuLOptions.prefserv.getCharPref(element.getAttribute("prefstring"));
					} catch (ex) {}
				}
		},	// initOptions
		
		savePrefs: function () {
			var element, eltType;

			for (var i = 0, it = HabuLOptions._elementIDs.length; i < it; i++) {
					element = document.getElementById(HabuLOptions._elementIDs[i]);
					if (!element) break;
					eltType = element.localName;

					if (eltType == "radiogroup") HabuLOptions.prefserv.setIntPref(element.getAttribute("prefstring"), element.selectedIndex);
					else if (eltType == "checkbox") HabuLOptions.prefserv.setBoolPref(element.getAttribute("prefstring"), element.checked);
					else if (eltType == "textbox" && element.preftype == "int") HabuLOptions.prefserv.setIntPref(element.getAttribute("prefstring"), parseInt(element.value));
					else if (eltType == "textbox") HabuLOptions.prefserv.setCharPref(element.getAttribute("prefstring"), element.value);
				}
		} // savePrefs

	}; // HabuLOptions
}
