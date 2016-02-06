# 

Q = require 'q'

add = (a, b)->
  deferred  = Q.defer()
  
  setTimeout ()->
    deferred.resolve a + b
  , 1000
  
  deferred.promise

Q.all [
  (add 1, 2),
  (add 2, 3),
  (add 3, 4)
]
.then (res)->
  console.log res