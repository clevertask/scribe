export const streamedContent = String.raw`
<h1>Streamed Title</h1>
<p>This is the first paragraph of a longer streamed HTML text.  It demonstrates how to include various HTML elements and format code examples.</p>
<h2>Code Examples</h2>
<p>Here's a JavaScript code example:</p>
<pre><code class="language-javascript">
// Function to calculate the factorial of a number
function factorial(n) {
  if (n === 0) {
    return 1;
  }
  return n * factorial(n - 1);
}

// Calculate the factorial of 5
const result = factorial(5);
console.log(result); // Output: 120
</code></pre>
<p>And here's a Python code example:</p>
<pre><code class="language-python">
# Function to calculate the Fibonacci sequence up to n terms
def fibonacci(n):
    a, b = 0, 1
    if n <= 0:
        return []
    elif n == 1:
        return [a]
    else:
        list_fib = [a, b]
        while len(list_fib) < n:
            c = a + b
            a, b = b, c
            list_fib.append(c)
        return list_fib

# Generate the Fibonacci sequence up to 10 terms
result = fibonacci(10)
print(result) # Output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
</code></pre>
<h3>More Text</h3>
<p>This is some additional text to make the content longer.  You can continue adding more paragraphs, headings, lists, and other HTML elements as needed.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
  <li>Item 3</li>
</ul>
<p>Remember to style the code blocks appropriately using CSS.  For example, you might use a library like Prism.js or highlight.js for syntax highlighting.</p>
<pre><code class="language-html">
&lt;!DOCTYPE html&gt;
&lt;html&gt;
&lt;head&gt;
  &lt;title&gt;Example HTML&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;p&gt;This is an example of HTML code.&lt;/p&gt;
&lt;/body&gt;
&lt;/html&gt;
</code></pre>

<h1>Math expressions</h1>
<p>\frac{a}{b}\pm\sqrt{x^2+y^2}</p>
<p>[ \frac{2}{3} \div \frac{4}{5} = \frac{2}{3} \times \frac{5}{4} ] </p>
`;
