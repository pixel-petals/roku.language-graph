' Roku BrightScript Example Code for Tree-Sitter Testing

function initApp() as Dynamic
  screen = CreateObject("roScreen")
  port = CreateObject("roMessagePort")
  
  screen.AddMessagePort(port)
  return screen
end function

sub main()
  ' Initialize
  screen = initApp()
  
  ' Simple loop
  for i = 1 to 5
    print "Count: " + i
  end for
  
  ' Associative array (object)
  config = {
    width: 1280,
    height: 720,
    fps: 30,
    title: "My App"
  }
  
  ' Process array
  items = [10, 20, 30, 40, 50]
  sum = 0
  
  for each item in items
    sum = sum + item
  end for
  
  print "Sum: " + sum
  
  ' Conditional logic
  if sum > 100 then
    print "Sum is large"
  else if sum > 50 then
    print "Sum is medium"
  else
    print "Sum is small"
  end if
  
  ' While loop with exit
  counter = 0
  while true
    counter = counter + 1
    print "Loop: " + counter
    
    if counter >= 3 then
      exit while
    end if
  end while
  
  ' Function call with arithmetic
  result = calculateFibonacci(10)
  print "Fibonacci(10) = " + result
  
  ' Member access and optional chaining
  person = {}
  person.name = "John"
  person.age = 30
  
  if person?.name <> invalid then
    print "Person name: " + person.name
  end if
  
  ' Type designators
  count% = 100
  message$ = "Hello, World!"
  price! = 19.99
  pi# = 3.14159265358979
  
  ' Logical operators
  if (count% > 50) and (message$ <> "") or (price! < 100) then
    print "Complex condition true"
  end if
  
  ' Bitwise operations
  a = 5
  b = 3
  c = a & b
  d = a | b
  e = a ^ b
  
  ' Boolean operations
  flag1 = true
  flag2 = false
  result = flag1 and not flag2
  
  print "Program complete"
end sub

function calculateFibonacci(n as Integer) as Integer
  if n <= 1 then
    return n
  end if
  
  prev = 0
  curr = 1
  
  for i = 2 to n
    temp = curr
    curr = prev + curr
    prev = temp
  end for
  
  return curr
end function

sub processArray(arr as Object)
  for each element in arr
    print element
  end for
end sub

function getConfig() as Object
  return {
    host: "192.168.1.1",
    port: 8080,
    timeout: 5000,
    retries: 3
  }
end function

' Call main
main()
