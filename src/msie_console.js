
if (Prototype.Browser.IE) 
  var console = {
    log: function(s1, s2, s3) {
        var msgs = $('msgs');
        
        if (!msgs) {
            var el = document.createElement('div');
            el.id = "msgs";
            el.style.background = "lightblue";
            el.style.position = "absolute";
            el.style.z_index = "10px";
            el.style.left = "350px";
            msgs = document.body.insertBefore(el, document.body.firstChild);
        }

        msgs.innerHTML += s1 + s2 + s3 + "<br>";
    }
  };

