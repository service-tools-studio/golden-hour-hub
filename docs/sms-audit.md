# Text message bodies

Placeholders: `{cleanerFirstName}`, `{customerName}`, `{streetAddress}`, `{date}`, `{startTime}`, `{duration}`, `{scheduledTime}`, `{arrivalTime}`, `{weekRange}`, `{link}`.

## To cleaners

**Direct assignment**

> Hi {cleanerFirstName}! Golden Hour Hub here.
> You have been assigned to this cleaning:
>
> {date} at {startTime}
>
> {customerName} - {serviceType}
>
> {address}
>
> Details are in the Golden Hour Hub app: {link}

**Invitation**

> Hi {cleanerFirstName}! Golden Hour Hub here.
> You have been invited to this cleaning:
>
> {date} at {startTime}
>
> {customerName} - {serviceType}
>
> {address}
>
> Open the Golden Hour Hub app to accept or decline as soon as you can: {link}

**Invitation follow-up**

> Hi {cleanerFirstName}! Golden Hour Hub reminder: please accept or decline your cleaning invitation for {customerName} on {date} in the Golden Hour Hub app as soon as possible: {link}

**Removed from cleaning**

> Hi {cleanerFirstName}! Golden Hour Hub here. You've been removed from the cleaning for {customerName} on {date}. Reach out to Kelsey if you have questions.

**Assignment details changed**

> Hi {cleanerFirstName}! Golden Hour Hub here.
> This cleaning has been updated:
>
> {date} at {startTime}
>
> Approximately {duration} on site
>
> {customerName} - {serviceType}
>
> {address}

**Arrival time changed**

> Hi {cleanerFirstName}! Golden Hour Hub here.
> This cleaning has been updated:
>
> {date} at {startTime}
>
> {customerName} - {serviceType}
>
> {address}

**Availability reminder (next week)**

> Hi {cleanerFirstName}! Golden Hour Hub reminder: please submit your availability for next week ({weekRange}) by Sunday: {link}

## To customers (manual only — no server send)

Admin taps **Text client**; opens Messages with a prefilled body. Twilio never texts customers.

**Arrival time update**

> Hi {customerFirstName}! This is Golden Hour Cleaning Co. We wanted to let you know that your cleaning on {date} is now expected to begin around {arrivalTime} instead of {scheduledTime}. Please allow a one-hour arrival window, as our cleaners may be coming from other appointments. If this timing doesn't work for you, just reply to this message and we'll be happy to coordinate!
