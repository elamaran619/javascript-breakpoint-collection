import debugObj, {registry, objectsAndPropsByDebugId, updateDebugIdCallback, resetDebug} from "./breakpoints/debugObj"
import predefinedBreakpoints from "./breakpoints/predefinedBreakpoints"

(function(){
    if (window.breakpoints !== undefined) {
        if (!window.breakpoints.__internal || !window.breakpoints.__internal.isBreakpointCollectionExtension) {
            console.log("Breakpoints extension can't load, global `breakpoints` variable is already defined")
        }
        return;
    }

    function debuggerFunction(){
        debugger;
    }
    debuggerFunction.callbackType = "debugger";
    

    function debugCall(object, prop, callback){
        callback = getCallbackFromUserFriendlyCallbackArgument(callback, object, prop, "call")

        return debugObj(object, prop, {
            propertyCallBefore: callback
        })
    }

    var debugPropertyGet = function(object, propertyName, callback){
        return debugObj(object, propertyName, {
            propertyGetBefore: callback
        })
    }
    var debugPropertySet = function(object, propertyName, callback) {
        return debugObj(object, propertyName, {
            propertySetBefore: callback
        })
    }

    var registeredBreakpoints = [];

    function pushRegisteredBreakpointsToExtension() {
        var event = new CustomEvent("RebroadcastExtensionMessage", {
            type: "updateRegisteredBreakpoints",
            registeredBreakpoints: registeredBreakpoints
        });
        window.dispatchEvent(event);
    }

    pushRegisteredBreakpointsToExtension();

    function getCallbackFromUserFriendlyCallbackArgument(callback, object, propertyName, accessType){
        if (typeof callback === "function") {
            callback.callbackType = "custom"
            return callback;
        } else if (typeof callback === "string") {
            if (callback === "debugger") {
                return debuggerFunction;
            } else if (callback === "trace") {
                return getTraceFunction(object, propertyName, accessType);
            } else {
                throw new Error("Invalid string callback")
            }
        } else if(typeof callback=== "undefined") {
            return debuggerFunction;
        } else {
            throw new Error("Invalid callback type")
        }
    }

    function getTraceFunction(object, propertyName, accessType) {
        var traceFn = function(){
            console.trace("About to " + accessType + " property '" + propertyName + "' on this object: ", object)
        }
        traceFn.callbackType = "trace"
        return traceFn
    }

    function getCallbackFromBreakpointDetails(details, object, propertyName) {
        if (details.type === "debugger") {
            return debuggerFunction;
        }
        else if (details.type === "trace") {
            return function(){
                var traceMessage = details.traceMessage;
                if (traceMessage !== undefined) {
                    console.trace(details.traceMessage);
                }
                else {
                    var traceFn = getTraceFunction(object, propertyName, details.accessType);
                    traceFn();
                }
            }
        } else {
            throw new Error("Invalid breakpoint type")
        }
    }

    var __internal = {
        isBreakpointCollectionExtension: true,
        debug: {
            _registry: registry,
            _debugObj: debugObj,
            _objectsAndPropsByDebugId: objectsAndPropsByDebugId,
            _registeredBreakpoints: registeredBreakpoints
        },
        registerBreakpointAndGetResetBreakpointFunction: function(){
            var breakpointId = __internal.registerBreakpoint.apply(this, arguments);
            // Comments in following functions are to show more info when function appears logged in console
            return function resetBreakpoint(){
                __internal.disableBreakpoint(breakpointId);
            }
        },
        registerBreakpoint: function(fn, bpDetails, fixedCallback){
            var debugIds = [];
            var _debugPropertyGet = function(object, propertyName, callback){
                if (fixedCallback) {
                    callback = fixedCallback;
                }
                debugIds.push(debugPropertyGet(object, propertyName, callback));
            }
            var _debugPropertySet = function(object, propertyName, callback){
                if (fixedCallback) {
                    callback = fixedCallback;
                }
                debugIds.push(debugPropertySet(object, propertyName, callback));
            }
            var _debugCall = function(object, propertyName, callback){
                if (fixedCallback) {
                    callback = fixedCallback;
                }
                debugIds.push(debugCall(object, propertyName, callback));
            }
            fn(_debugPropertyGet, _debugPropertySet, _debugCall);
            var id = Math.floor(Math.random() * 1000000000)
            registeredBreakpoints.push({
                id: id,
                debugIds,
                details: bpDetails
            });

            pushRegisteredBreakpointsToExtension();

            return id;
        },
        createSpecificBreakpoint: function(breakpointName){
            window.breakpoints[breakpointName]();
        },
        registerBreakpointFromExtension: function(fn, bpDetails){
            var fixedCallback = getCallbackFromBreakpointDetails(bpDetails);
            var id = window.breakpoints.__internal.registerBreakpoint(fn, bpDetails, fixedCallback);
        },
        getRegisteredBreakpoints: function(){
            return registeredBreakpoints;
        },
        disableBreakpoint: function(id){
            var bp = registeredBreakpoints.filter(function(bp){
                return bp.id == id;
            })[0];
            if (bp === undefined) {
                console.log("Couldn't find breakpoint with id", id)
                return;
            }
            bp.debugIds.forEach(function(debugId){
                resetDebug(debugId);
            });
            registeredBreakpoints = registeredBreakpoints.filter(function(bp){
                return bp.id != id;
            })

            pushRegisteredBreakpointsToExtension();
        },
        updateBreakpoint: function(id, details){
            var bp = registeredBreakpoints.filter(function(bp){
                return bp.id == id;
            })[0];

            bp.debugIds.forEach(function(debugId){
                var objAndProp = objectsAndPropsByDebugId[debugId];
                var object = objAndProp.obj;
                var propertyName = objAndProp.prop;
                var callback = getCallbackFromBreakpointDetails(details, object, propertyName);
                updateDebugIdCallback(debugId, callback)
            });
            
            bp.details = details;

            pushRegisteredBreakpointsToExtension();
        }
    }

    var breakpoints = {
        debugPropertyGet: function(obj, prop, callback){
            callback = getCallbackFromUserFriendlyCallbackArgument(callback, obj, prop, "get");
            return __internal.registerBreakpointAndGetResetBreakpointFunction(function(
                debugPropertyGet, debugPropertySet, debugCall
                ){
                    debugPropertyGet(obj, prop, callback);
            }, {
                title: "debugPropertyGet (" + prop + ")",
                type: callback.callbackType,
                accessType: "get"
            });
        },
        debugPropertySet: function(obj, prop, callback){
            callback = getCallbackFromUserFriendlyCallbackArgument(callback, obj, prop, "set");
            return __internal.registerBreakpointAndGetResetBreakpointFunction(function(
                debugPropertyGet, debugPropertySet, debugCall
                ){
                    debugPropertySet(obj, prop, callback);
            }, {
                title: "debugPropertySet (" + prop + ")",
                type: callback.callbackType,
                accessType: "set"
            });
        },
        debugPropertyCall: function(obj, prop, callback){
            callback = getCallbackFromUserFriendlyCallbackArgument(callback, obj, prop, "call");
            return __internal.registerBreakpointAndGetResetBreakpointFunction(function(
                debugPropertyGet, debugPropertySet, debugCall
                ){
                    debugCall(obj, prop, callback);
            }, {
                title: "debugPropertyCall (" + prop + ")",
                type: callback.callbackType,
                accessType: "call"
            });
        },
        __internal
    }
    
    predefinedBreakpoints.forEach(function(breakpoint){
        breakpoints[breakpoint.title] = function(callback){
            callback = getCallbackFromUserFriendlyCallbackArgument(callback);

            var details = {
                title: breakpoint.title,
                traceMessage: breakpoint.traceMessage,
                type: callback.callbackType
            }

            var fn = function(debugPropertyGet, debugPropertySet, debugPropertyCall){
                if (breakpoint.debugPropertyGets) {
                    breakpoint.debugPropertyGets.forEach(function(property){
                        debugPropertyGet(eval(property.obj), property.prop, callback)
                    })
                }
                if (breakpoint.debugPropertySets) {
                    breakpoint.debugPropertySets.forEach(function(property){
                        debugPropertySet(eval(property.obj), property.prop, callback)
                    })
                }
                if (breakpoint.debugCalls) {
                    breakpoint.debugCalls.forEach(function(property){
                        debugPropertyCall(eval(property.obj), property.prop, callback)
                    })
                }
            }

            return __internal.registerBreakpointAndGetResetBreakpointFunction(fn,  details);
        }
    });

    window.breakpoints = breakpoints;
})();