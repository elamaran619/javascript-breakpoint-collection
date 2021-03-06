import predefinedBreakpoints from "../breakpoints/predefinedBreakpoints"

var appState = {
    registeredBreakpoints: [],
    predefinedBreakpoints
}

var appViews = [];

export function activateBreakpoint(breakpoint, options){
    var code = "window.breakpoints." + breakpoint.title + "('trace')"
    evalInInspectedWindow(code);
}

export function deactivateBreakpoint(breakpoint) {
    var code = "window.breakpoints.__internal.disableBreakpoint(" + breakpoint.id + ");"
    evalInInspectedWindow(code);
}

export function updateBreakpointType(breakpoint, traceOrDebugger){
    var id = breakpoint.id;
    var code = "window.breakpoints.__internal.updateBreakpointType('"+ id + "', '" + traceOrDebugger + "');"
    evalInInspectedWindow(code)
}

export function setTypeOfMostRecentBreakpointToDebugger(){
    evalInInspectedWindow("breakpoints.__internal.setTypeOfMostRecentBreakpointToDebugger()")
}

function checkIfBreakpointsInstalledOnPage(callback) {
    evalInInspectedWindow("window.breakpoints !== undefined", function(result){
        callback(result);
    })
}

function isRunningInDevToolsPanel(){
    return typeof chrome !== "undefined" && chrome.devtools && chrome.devtools.inspectedWindow;
}

function evalInInspectedWindow(code, callback){
    if (isRunningInDevToolsPanel()) {
        chrome.devtools.inspectedWindow.eval(code, afterEval);
    } else {
        try {
            var returnValue = eval(code);
            afterEval(returnValue)
        } catch (err) {
            afterEval(null, {value: err, isException: true});
        }
    }

    function afterEval(result, err){
        if (err && err.isException) {
            console.log("Exception occured in eval'd code", err.value)
            console.log("Code that was run: ", code)
        }
        else {
            if (callback) {
                callback(result);
            }
        }
    }
}

function readBreakpointsFromPage(){
    evalInInspectedWindow("breakpoints.__internal.getRegisteredBreakpoints();", function(regBp){
        appState.registeredBreakpoints = regBp;
        updateApp();
    });
}

function installBreakpointsOnPage(callback){
    var src;
    if (isRunningInDevToolsPanel()){
        src = chrome.extension.getURL('build/javascript-breakpoint-collection.js');
    } else {
        src = "extension/build/javascript-breakpoint-collection.js"
    }
    var code = `
        var s = document.createElement('script');
        s.src = '${src}'
        s.onload = function() {
            this.parentNode.removeChild(this);
        };
        (document.head || document.documentElement).appendChild(s);
    `;
    evalInInspectedWindow(code, function(){
        callCallbackIfHasBeenInstalled();

        function callCallbackIfHasBeenInstalled(){
            checkIfBreakpointsInstalledOnPage(function(isInstalled){
                if (isInstalled) {
                    callback()
                } else {
                    setTimeout(function(){
                        callCallbackIfHasBeenInstalled();
                    }, 50)
                }
            })
        }
    });
}

export function registerAppView(appView){
    appViews.push(appView)
}

function updateApp(){
    appViews.forEach(function(appView){
        appView.update()
    })
}

checkIfBreakpointsInstalledOnPage(function(isInstalled){
    if (isInstalled) {
        readBreakpointsFromPage();
    } else {
        installBreakpointsOnPage(function(){
            readBreakpointsFromPage();
        })
    }
})

if (isRunningInDevToolsPanel()) {
    var backgroundPageConnection = chrome.runtime.connect({
        name: "devtools-page"
    });

    backgroundPageConnection.onMessage.addListener(function (message) {
        // console.log("readBreakpointsFromPage b/c bg page said so")
        readBreakpointsFromPage();
    });
} else {
    window.addEventListener("RebroadcastExtensionMessage", function(){
        readBreakpointsFromPage();
    });
}

export {appState}
