// fireEvent : should be COPIED into controller objects, so that 
// 'this' is properly bound to the controller

GvaScript.fireEvent = function(/* type, elem1, elem2, ... */) {

  var event;

  switch (typeof arguments[0]) {
  case "string" : 
    event = {type: arguments[0]}; 
    break;
  case "object" :
    event = arguments[0];
    break;
  default:
    throw new Error("invalid first argument to fireEvent()");
  }
  
  var propName = "on" + event.type;
  var handler;
  var target   = arguments[1]; // first element where the event is triggered
  var currentTarget;           // where the handler is found


  // try to find the handler, first in the HTML elements, then in "this"
  for (var i = 1, len = arguments.length; i < len; i++) {
    var elem = arguments[i];
    if (handler = elem.getAttribute(propName)) {
      currentTarget = elem;
      break;
    }
  }
  if (currentTarget === undefined)
    if (handler = this[propName])
      currentTarget = this;

  if (handler) {
    // build context 
    var controller = this;
    event.target = event.srcElement = target;
    event.currentTarget = currentTarget;
    event.controller    = controller;

    if (typeof(handler) == "string") {
      // string will be eval-ed in a closure context where 'this', 'event',
      // 'target' and 'controller' are defined.
      var eval_handler = function(){return eval( handler ) };
      handler = eval_handler.call(currentTarget); // target bound to 'this'
    }

    if (handler instanceof Function) {
      // now call the eval-ed or pre-bound handler
      return handler(event);
    }
    else 
      return handler; // whatever was returned by the string evaluation
  }
  else
    return null; // no handler found
};

